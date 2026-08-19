// Real hardware facts, for the model fit verdicts.
//
// The rule this file exists to keep: a missing fact produces "unknown", never a
// zero and never an optimistic guess. A verdict inferred from a model's name is
// the specific failure the contract names, and treating absent metadata as zero
// is the quiet version of the same mistake.

import { totalmem, freemem, cpus, arch, platform } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statfs } from 'node:fs/promises';

const run = promisify(execFile);

export type Unknown = { known: false; why: string };
export type Known<T> = { known: true; value: T };
export type Fact<T> = Known<T> | Unknown;

const unknown = (why: string): Unknown => ({ known: false, why });
const known = <T>(value: T): Known<T> => ({ known: true, value });

export interface HardwareProbe {
	probedAt: string;
	platform: string;
	arch: string;
	cpuModel: Fact<string>;
	cpuCores: Fact<number>;
	totalRamBytes: Fact<number>;
	freeRamBytes: Fact<number>;
	gpuName: Fact<string>;
	vramBytes: Fact<number>;
	freeDiskBytes: Fact<number>;
	notes: string[];
}

async function probeGpuWindows(): Promise<{
	name: Fact<string>;
	vram: Fact<number>;
	note?: string;
}> {
	// nvidia-smi is exact when it is there. It is the only source here that
	// reports usable VRAM rather than a driver-reported adapter total.
	try {
		const { stdout } = await run(
			'nvidia-smi',
			['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
			{ timeout: 4000 }
		);
		const first = stdout.trim().split('\n')[0];
		if (first) {
			const [name, mib] = first.split(',').map((s) => s.trim());
			const bytes = Number(mib) * 1024 * 1024;
			if (name && Number.isFinite(bytes) && bytes > 0) {
				return { name: known(name), vram: known(bytes) };
			}
		}
	} catch {
		/* not an NVIDIA machine, or the tool is not installed */
	}

	// WMI knows the adapter's name reliably. Its AdapterRAM field is a 32-bit
	// value that wraps above 4 GB, so a card with more than that reports less
	// than it has — which is why the name is taken and the size is not.
	try {
		const { stdout } = await run(
			'powershell',
			[
				'-NoProfile',
				'-Command',
				'(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)'
			],
			{ timeout: 6000 }
		);
		const name = stdout.trim();
		if (name) {
			return {
				name: known(name),
				vram: unknown(
					'The adapter reports its memory through a 32-bit field that wraps above 4 GB, so its value is not trustworthy. Install nvidia-smi, or read the figure from the driver control panel.'
				),
				note: 'GPU memory was left unknown rather than reported from a field known to under-count.'
			};
		}
	} catch {
		/* fall through */
	}

	return {
		name: unknown('No GPU could be identified on this system.'),
		vram: unknown('No GPU was identified, so its memory is unknown.')
	};
}

export async function probe(modelDestination?: string): Promise<HardwareProbe> {
	const notes: string[] = [];
	const cpuList = cpus();

	let gpuName: Fact<string> = unknown('GPU probing is only implemented for Windows in this build.');
	let vramBytes: Fact<number> = unknown(
		'GPU probing is only implemented for Windows in this build.'
	);

	if (platform() === 'win32') {
		const g = await probeGpuWindows();
		gpuName = g.name;
		vramBytes = g.vram;
		if (g.note) notes.push(g.note);
	}

	let freeDiskBytes: Fact<number> = unknown(
		'No model destination was supplied, so free space was not measured.'
	);
	if (modelDestination) {
		try {
			const s = await statfs(modelDestination);
			freeDiskBytes = known(Number(s.bavail) * Number(s.bsize));
		} catch (e) {
			freeDiskBytes = unknown(
				'Free space on ' + modelDestination + ' could not be read: ' + String(e)
			);
		}
	}

	return {
		probedAt: new Date().toISOString(),
		platform: platform(),
		arch: arch(),
		cpuModel: cpuList.length
			? known(cpuList[0].model.trim())
			: unknown('The operating system reported no CPU information.'),
		cpuCores: cpuList.length
			? known(cpuList.length)
			: unknown('The operating system reported no CPU information.'),
		totalRamBytes: known(totalmem()),
		freeRamBytes: known(freemem()),
		gpuName,
		vramBytes,
		freeDiskBytes,
		notes
	};
}

export type Verdict = 'Runs well' | 'Runs with limits' | 'Unlikely' | 'Unknown';

export interface FitResult {
	verdict: Verdict;
	evidence: string[];
	assumptions: string[];
	probedAt: string;
}

/**
 * Combines measured hardware with a model's real metadata.
 *
 * `blobBytes` is the model's actual download size. If it is not known, the
 * answer is Unknown — never a guess from the name, and never zero.
 */
export function fit(
	hw: HardwareProbe,
	model: {
		blobBytes?: number;
		parameterCount?: number;
		quantisation?: string;
		contextTokens?: number;
	}
): FitResult {
	const evidence: string[] = [];
	const assumptions: string[] = [];

	if (!model.blobBytes || !Number.isFinite(model.blobBytes) || model.blobBytes <= 0) {
		return {
			verdict: 'Unknown',
			evidence: ['The catalogue did not report a size for this model.'],
			assumptions: [
				'A size is never inferred from a model name or parameter count, so no verdict is offered.'
			],
			probedAt: hw.probedAt
		};
	}

	const gb = (n: number) => (n / 1024 ** 3).toFixed(1) + ' GB';
	const weights = model.blobBytes;
	evidence.push('Model weights: ' + gb(weights) + ' (from the catalogue, not estimated).');

	// The rest of the model's metadata, used rather than merely accepted.
	//
	// The first version took blobBytes and ignored parameterCount, quantisation
	// and contextTokens entirely, while the contract said the verdict combined
	// all four. A flat fifteen per cent for the KV cache is wrong in the
	// direction that matters: it is the CONTEXT WINDOW that decides how large
	// that cache gets, and a model declaring 128k tokens needs several times what
	// one declaring 4k does, at identical weights.
	if (model.parameterCount) {
		evidence.push('Parameters: ' + model.parameterCount + ' (declared).');
	} else {
		assumptions.push('The parameter count was not declared, so nothing is inferred from it.');
	}
	if (model.quantisation) {
		evidence.push('Quantisation: ' + model.quantisation + '.');
	} else {
		assumptions.push('The quantisation was not declared. It is not guessed at from the file size.');
	}

	// A 4096-token window is the baseline the flat allowance was calibrated for.
	// Anything larger scales the cache; anything smaller does not shrink it below
	// the floor, because the runtime itself needs room whatever the context is.
	const BASELINE_CONTEXT = 4096;
	const FLOOR = 0.6 * 1024 ** 3;
	let overhead;
	if (model.contextTokens && Number.isFinite(model.contextTokens) && model.contextTokens > 0) {
		const scale = Math.max(1, model.contextTokens / BASELINE_CONTEXT);
		overhead = Math.max(FLOOR, weights * 0.15 * scale);
		evidence.push('Declared context window: ' + model.contextTokens.toLocaleString() + ' tokens.');
		assumptions.push(
			'Allows ' +
				gb(overhead) +
				' for the KV cache and runtime overhead, scaled from the declared ' +
				model.contextTokens.toLocaleString() +
				'-token window against a ' +
				BASELINE_CONTEXT.toLocaleString() +
				'-token baseline. This is a rule of thumb, not a measurement.'
		);
	} else {
		// Missing metadata makes the answer MORE conservative, never less. Treating
		// an unknown context as the baseline would quietly flatter every model that
		// failed to declare one.
		overhead = Math.max(FLOOR, weights * 0.3);
		assumptions.push(
			'The context window was not declared. Rather than assume a small one, this allows ' +
				gb(overhead) +
				' — twice the baseline — so an undeclared long context cannot turn an over-optimistic verdict into a surprise.'
		);
	}
	const needed = weights + overhead;

	const vram = hw.vramBytes.known ? hw.vramBytes.value : null;
	const ram = hw.totalRamBytes.known ? hw.totalRamBytes.value : null;

	if (vram === null && ram === null) {
		return {
			verdict: 'Unknown',
			evidence: [...evidence, 'Neither GPU memory nor system memory could be measured.'],
			assumptions,
			probedAt: hw.probedAt
		};
	}

	if (hw.freeDiskBytes.known && hw.freeDiskBytes.value < weights) {
		return {
			verdict: 'Unlikely',
			evidence: [
				...evidence,
				'Free space on the model destination is ' +
					gb(hw.freeDiskBytes.value) +
					', which is less than the download itself.'
			],
			assumptions,
			probedAt: hw.probedAt
		};
	}

	if (vram !== null) {
		evidence.push('Usable GPU memory: ' + gb(vram) + '.');
		if (needed <= vram * 0.85) {
			return {
				verdict: 'Runs well',
				evidence: [...evidence, 'Fits in GPU memory with headroom.'],
				assumptions,
				probedAt: hw.probedAt
			};
		}
		if (needed <= vram) {
			return {
				verdict: 'Runs with limits',
				evidence: [...evidence, 'Fits in GPU memory, but with little headroom for a long context.'],
				assumptions,
				probedAt: hw.probedAt
			};
		}
		evidence.push('Does not fit in GPU memory, so it would run partly or wholly on the CPU.');
	} else {
		evidence.push('GPU memory is unknown: ' + (hw.vramBytes.known ? '' : hw.vramBytes.why));
	}

	if (ram === null) {
		return { verdict: 'Unknown', evidence, assumptions, probedAt: hw.probedAt };
	}

	evidence.push('System memory: ' + gb(ram) + '.');
	if (needed <= ram * 0.5) {
		return {
			verdict: 'Runs with limits',
			evidence: [
				...evidence,
				'Comfortably within system memory, but CPU inference is much slower than GPU.'
			],
			assumptions,
			probedAt: hw.probedAt
		};
	}
	if (needed <= ram * 0.8) {
		return {
			verdict: 'Unlikely',
			evidence: [
				...evidence,
				'Would use most of system memory, leaving little for anything else running.'
			],
			assumptions,
			probedAt: hw.probedAt
		};
	}
	return {
		verdict: 'Unlikely',
		evidence: [...evidence, 'Needs more memory than this machine has.'],
		assumptions,
		probedAt: hw.probedAt
	};
}
