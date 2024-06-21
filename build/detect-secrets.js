#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * This script wraps detect-secrets for convenience. Run it from the root of the git repository.
 */

// Imports
const child_process = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const colors = require('colors');

// Debug print handling
const debugFlag = process.argv.includes('--debug');
const printDebug = (message, isCommand = false) => {
	if (!debugFlag || !message) {
		return;
	}
	console.debug(`${isCommand ? '$ ' : ''}${message.toString().trim()}`.white.bgBlue);
};

// Wrapper function for child_process.execSync
const execSync = (command, stdio = ['inherit', 'pipe', 'pipe']) => {
	return child_process.execSync(command, { encoding: 'utf8', stdio });
};

// Check if script is being run from the root of the git repository
try {
	const gitCommand = 'git rev-parse --show-toplevel';
	printDebug(gitCommand, true);
	const gitRepoRoot = execSync(gitCommand);
	printDebug(gitRepoRoot);
	printDebug('current working directory: ' + process.cwd());
	if (process.cwd().trim() !== gitRepoRoot.trim()) {
		console.error(`${'Error:'.red} Please run this script from the root of the git repository.`);
		process.exit(1);
	}
} catch (error) {
	console.error(`${'Error:'.red} Could not determine the root of the git repository: ${error}`);
	process.exit(1);
}

// Usage message
const usage = `Usage: node build/detect-secrets.js ${'[command]'.magenta}

Commands:
    ${'init-baseline'.magenta}: create a baseline file with all secrets in the repo
    ${'audit-baseline'.magenta}: audit the baseline file to mark false positives
    ${'update-baseline'.magenta}: update the baseline file with all secrets in the repo
    ${'generate-report'.magenta}: generate a JSON report of all secrets in the repo
    ${'run-hook'.magenta}: run the detect-secrets-hook on staged files
    ${'help'.magenta}: print this help message

You can also include the ${'--debug'.magenta} flag to print debug log messages.`;

// Print usage if no arguments are provided or if the help flag is present
const emptyArgs = process.argv.length === 2;
if (emptyArgs || process.argv.includes('help')) {
	console.log(usage);
	process.exit(0);
}

// Print error and usage if too many arguments are provided
const argCount = process.argv.length - (debugFlag ? 1 : 0);
const tooManyArgs = argCount > 3;
if (tooManyArgs) {
	console.error(`${'Error:'.red} Too many arguments. Please only specify one command.`);
	console.log(); // print newline
	console.log(usage);
	process.exit(1);
}

// Wrapper function for running detect-secrets
const detectSecrets = (args, stdio) => {
	const dsCommand = `detect-secrets ${args}`;
	printDebug(dsCommand, true);
	try {
		const result = execSync(dsCommand, stdio);
		printDebug(result);
	} catch (error) {
		printDebug(error);
	}
};

// Ensure that detect-secrets is installed
try {
	detectSecrets('--version');
} catch (error) {
	console.error(`${'Error:'.red} detect-secrets is not installed. Install detect-secrets with ${'pip install detect-secrets'.magenta} or ${'brew install detect-secrets'.magenta}.`);
	process.exit(1);
}

// Constants
const command = process.argv[2];
const detectSecretsDir = path.join('build', 'secrets');
const baselineFileName = '.secrets.baseline';
const baselineFile = path.join(detectSecretsDir, baselineFileName);
const reportFile = path.join(detectSecretsDir, 'secrets-report.json');

// Check if the baseline file exists
const baselineFileExists = () => {
	return fs.existsSync(baselineFile);
};

// Ensure that the baseline file exists and exit if it does not
const ensureBaselineFileExists = () => {
	if (!baselineFileExists()) {
		console.error(`${'Error:'.red} Baseline file ${baselineFile.underline} does not exist.
Run ${'node detect-secrets.js init-baseline'.magenta} to create it.`);
		process.exit(1);
	}
	return;
};

// Get staged files
const getStagedFiles = () => {
	try {
		// -z option is used to separate file names with null characters
		const diffCommand = 'git diff --cached --name-only -z';
		printDebug(diffCommand, true);
		// Split the output by null characters and remove empty strings, then join the files with a
		// space so that they can be passed as arguments to detect-secrets-hook
		const diffOutput = execSync(diffCommand).split('\0').filter(x => !!x).join(' ');
		printDebug(diffOutput);
		return diffOutput;
	} catch (error) {
		console.error(`${'Error:'.red} Could not get staged files: ${error}`);
		process.exit(1);
	}
};

// Run detect-secrets-hook on staged files
const runDetectSecretsHook = () => {
	try {
		const hookCommand = `detect-secrets-hook ${noVerify} --baseline ${baselineFile} ${excludeFilesOption} ${getStagedFiles()}`;
		printDebug(hookCommand, true);
		const result = execSync(hookCommand);
		printDebug(result);
	} catch (error) {
		const secretsFound = error.status === 1;
		if (secretsFound) {
			console.error(error.stdout.toString().red);
		}
		process.exit(error.status);
	}
};

// --no-verify is used to skip additional secret verification via a network call
// If it is specified for creating the baseline file, it should also be specified for updating the baseline file
const noVerify = '--no-verify';

// Exclude external files (third-party libraries, etc.) from the baseline file
//   - https://github.com/Yelp/detect-secrets?tab=readme-ov-file#--exclude-files
// The baseline file needs to be excluded explicitly. This seems like a bug in detect-secrets since
// the default filter `detect_secrets.filters.common.is_baseline_file` should exclude the baseline file.
const excludeFiles = [
	`.*${baselineFileName}`,
	'.*cgmanifest.json',
	'.*/html-manager/dist/embed-amd.js',
	'src/vs/base/test/common/filters.perf.data.js',
	'.*/test/browser/recordings/windows11.*'
];
const excludeFilesOption = excludeFiles.map(file => `--exclude-files '${file}'`).join(' ');
printDebug(`Excluding files: ${excludeFilesOption}`);

// Run the appropriate command
switch (command) {
	case 'init-baseline':
		console.log(`Initializing detect-secrets baseline file ${baselineFile.underline}...`);
		if (baselineFileExists()) {
			// notify the user that the file already exists and ask if they want to overwrite it
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
			rl.question(
				`${'Warning:'.yellow
				} Baseline file ${baselineFile.underline} already exists.\nWould you like to overwrite it? ${'You will lose any marked false positives'.yellow
				}. (y/n): `,
				(answer) => {
					rl.close();
					if (answer.toLowerCase() === 'y') {
						console.log('\tOverwriting existing baseline file.');
						console.log('\tSecret scanning in progress...this should take less than a minute.');
						detectSecrets(`scan ${noVerify} ${excludeFilesOption} > ${baselineFile}`);
					} else {
						console.log('\tNot overwriting baseline file.');
						process.exit(0);
					}
				}
			);
		}
		break;
	case 'audit-baseline':
		console.log(`Auditing detect-secrets baseline file ${baselineFile.underline}...`);
		ensureBaselineFileExists();
		detectSecrets(`audit ${baselineFile}`, stdio = 'inherit');
		break;
	case 'update-baseline': {
		console.log(`Updating detect-secrets baseline file ${baselineFile.underline}...`);
		ensureBaselineFileExists();
		console.log('\tSecret scanning in progress...this should take a minute or so.');
		const startTime = new Date().getTime();
		// --force-use-all-plugins ensures that new plugins are picked up and used to update the baseline file
		detectSecrets(`scan ${noVerify} ${excludeFilesOption} --baseline ${baselineFile} --force-use-all-plugins`);
		const endTime = new Date().getTime();
		console.log(`\tBaseline file updated in ${(endTime - startTime) / 1000} seconds.`);
		break;
	}
	case 'generate-report':
		console.log(`Generating detect-secrets report...`);
		ensureBaselineFileExists();
		detectSecrets(`audit --report ${baselineFile} > ${reportFile}`);
		console.log(`\tReport generated to ${reportFile.underline}.`);
		break;
	case 'run-hook':
		ensureBaselineFileExists();
		runDetectSecretsHook();
		break;
	default:
		console.error(`${'Error:'.red} Invalid command ${command}. Run ${'node detect-secrets.js help'.magenta} for a list of commands.`);
		break;
}
