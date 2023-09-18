/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { IncomingMessage } from 'http';
import * as https from 'https';
import * as path from 'path';
import { promisify } from 'util';


// Promisify some filesystem functions.
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const existsAsync = promisify(fs.exists);

// Create a promisified version of https.get. We can't use the built-in promisify
// because the callback doesn't follow the promise convention of (error, result).
const httpsGetAsync = (opts: https.RequestOptions) => {
	return new Promise<IncomingMessage>((resolve, reject) => {
		const req = https.get(opts, resolve);
		req.once('error', reject);
	});
};

/**
 * Gets the version of Ark specified in package.json.
 *
 * @returns The version of Ark specified in package.json, or null if it cannot be determined.
 */
async function getVersionFromPackageJson(): Promise<string | null> {
	try {
		const packageJson = JSON.parse(await readFileAsync('package.json', 'utf-8'));
		return packageJson.positron.binaryDependencies?.ark || null;
	} catch (error) {
		console.error('Error reading package.json: ', error);
		return null;
	}
}

/**
 * Gets the version of Ark installed locally by reading a `VERSION` file that's written
 * by this `install-kernel` script.
 *
 * @returns The version of Ark installed locally, or null if ark is not installed.
 */
async function getLocalArkVersion(): Promise<string | null> {
	const versionFile = path.join('resources', 'ark', 'VERSION');
	try {
		const arkExists = await existsAsync(versionFile);
		if (!arkExists) {
			return null;
		}
		return readFileAsync(versionFile, 'utf-8');
	} catch (error) {
		console.error('Error determining ARK version: ', error);
		return null;
	}
}

/**
 * Helper to execute a command and return the stdout and stderr.
 *
 * @param command The command to execute.
 * @param stdin Optional stdin to pass to the command.
 * @returns A promise that resolves with the stdout and stderr of the command.
 */
async function executeCommand(command: string, stdin?: string):
	Promise<{ stdout: string; stderr: string }> {
	const { exec } = require('child_process');
	return new Promise((resolve, reject) => {
		const process = exec(command, (error: any, stdout: string, stderr: string) => {
			if (error) {
				reject(error);
			} else {
				resolve({ stdout, stderr });
			}
		});
		if (stdin) {
			process.stdin.write(stdin);
			process.stdin.end();
		}
	});
}

/**
 * Downloads the specified version of Ark and replaces the local binary.
 *
 * @param version The version of Ark to download.
 * @param githubPat A Github Personal Access Token with the appropriate rights
 *  to download the release.
 * @param patIsApproved Whether the PAT has been approved by the 'git
 *  credential' command. If it hasn't, we will approve the credential if it
 *  makes a successful API request to Github.
 */
async function downloadAndReplaceArk(version: string,
	githubPat: string,
	patIsApproved: boolean): Promise<void> {

	try {
		const requestOptions: https.RequestOptions = {
			headers: {
				'Accept': 'application/vnd.github.v3.raw', // eslint-disable-line
				'Authorization': `token ${githubPat}`,     // eslint-disable-line
				'User-Agent': 'positron-ark-downloader'    // eslint-disable-line
			},
			method: 'GET',
			protocol: 'https:',
			hostname: 'api.github.com',
			path: `/repos/posit-dev/amalthea/releases`
		};

		const response = await httpsGetAsync(requestOptions as any) as any;

		if (response.statusCode === 200 && !patIsApproved) {
			// If the PAT hasn't been approved yet, do so now.
			const { stdout, stderr } =
				await executeCommand('git credential approve',
					`protocol=https\n` +
					`host=api.github.com\n` +
					`path=/repos/posit-dev/amalthea/releases\n` +
					`username=\n` +
					`password=${githubPat}\n`);
			console.log(stdout);
			if (stderr) {
				console.warn(`Unable to approve PAT. You may be prompted for a username and ` +
					`password the next time you download Ark.`);
				console.error(stderr);
			}
		}

		let responseBody = '';

		response.on('data', (chunk: any) => {
			responseBody += chunk;
		});

		response.on('end', async () => {
			const releases = JSON.parse(responseBody);
			const release = releases.find((asset: any) => asset.tag_name === version);
			if (!release) {
				console.error(`Could not find Ark ${version} in the releases.`);
				return;
			}
			// For now, assume that the first asset is the one we want.
			const asset = release.assets[0];
			console.log(`Downloading Ark ${version} from ${asset.url}...`);
			const url = new URL(asset.url);
			const requestOptions: https.RequestOptions = {
				headers: {
					'Accept': 'application/octet-stream',    // eslint-disable-line
					'Authorization': `token ${githubPat}`,   // eslint-disable-line
					'User-Agent': 'positron-ark-downloader'  // eslint-disable-line
				},
				method: 'GET',
				protocol: url.protocol,
				hostname: url.hostname,
				path: url.pathname
			};

			let response = await httpsGetAsync(requestOptions) as any;
			while (response.statusCode === 302) {
				// Follow redirects.
				response = await httpsGetAsync(response.headers.location) as any;
			}
			let binaryData = Buffer.alloc(0);

			response.on('data', (chunk: any) => {
				binaryData = Buffer.concat([binaryData, chunk]);
			});
			response.on('end', async () => {
				// Create the resources/ark directory if it doesn't exist.
				if (!await existsAsync(path.join('resources', 'ark'))) {
					await fs.promises.mkdir(path.join('resources', 'ark'));
				}

				console.log(`Successfully downloaded Ark ${version} (${binaryData.length} bytes).`);
				const zipFileDest = path.join('resources', 'ark', 'ark.zip');
				await writeFileAsync(zipFileDest, binaryData);

				// Unzip the binary.
				const { stdout, stderr } =
					await executeCommand(`unzip -o ` +
						`${path.join('resources', 'ark', 'ark.zip')}` +
						` -d ` +
						`${path.join('resources', 'ark')}`);
				console.log(stdout);
				if (stderr) {
					console.error(stderr);
				} else {
					console.log(`Successfully unzipped Ark ${version}.`);
				}

				// Clean up the zipfile.
				await fs.promises.unlink(zipFileDest);

				// Write a VERSION file with the version number.
				await writeFileAsync(path.join('resources', 'ark', 'VERSION'), version);

			});
		});
	} catch (error) {
		console.error('Error downloading Ark:', error);
	}
}

async function main() {

	// Before we do any work, check to see if there is a locally built copy of Amalthea in the
	// `amalthea/target` directory. If so, we'll assume that the user is a kernel developer
	// and skip the download; this version will take precedence over any downloaded version.
	const positronParent = path.dirname(path.dirname(path.dirname(path.dirname(__dirname))));
	const amaltheaFolder = path.join(positronParent, 'amalthea');
	const targetFolder = path.join(amaltheaFolder, 'target');
	const debugBinary = path.join(targetFolder, 'debug', 'ark');
	const releaseBinary = path.join(targetFolder, 'release', 'ark');
	if (fs.existsSync(debugBinary) || fs.existsSync(releaseBinary)) {
		const binary = fs.existsSync(debugBinary) ? debugBinary : releaseBinary;
		console.log(`Using locally built Ark in ${binary}.`);

		// Copy the locally built ark to the resources/ark directory. It won't
		// be read from this directory at runtime, but we need to put it here so
		// that `yarn gulp vscode` will package it up (the packaging step
		// doesn't look for a sideloaded ark from an adjacent `amalthea`
		// directory).
		fs.mkdirSync(path.join('resources', 'ark'), { recursive: true });
		fs.copyFileSync(binary, path.join('resources', 'ark', 'ark'));

		// Copy the 'public' and 'private' R modules from the ark crate to the
		// resources/ark/modules directory.
		const modulesFolder = path.join(amaltheaFolder, 'crates', 'ark', 'src', 'modules');
		const modules = fs.readdirSync(modulesFolder);
		for (const moduleFolder of modules) {
			const allModules = fs.readdirSync(path.join(modulesFolder, moduleFolder));
			console.log(`Copying ${moduleFolder} modules.`);
			fs.mkdirSync(path.join('resources', 'ark', 'modules', moduleFolder),
				{ recursive: true });
			for (const module of allModules) {
				fs.copyFileSync(path.join(modulesFolder, moduleFolder, module),
					path.join('resources', 'ark', 'modules', moduleFolder, module));
			}
		}

		return;
	} else {
		console.log(`No locally built Ark found in ${path.join(positronParent, 'amalthea')}; ` +
			`checking downloaded version.`);
	}

	const packageJsonVersion = await getVersionFromPackageJson();
	const localArkVersion = await getLocalArkVersion();

	if (!packageJsonVersion) {
		console.error('Could not determine Ark version from package.json.');
		return;
	}

	console.log(`package.json version: ${packageJsonVersion}`);
	console.log(`Downloaded ark version: ${localArkVersion ? localArkVersion : 'Not found'}`);

	if (packageJsonVersion === localArkVersion) {
		console.log('Versions match. No action required.');
		return;
	}
	// Get the GITHUB_PAT from the environment.
	let githubPat = process.env.GITHUB_PAT;
	let patIsApproved = true;
	if (!githubPat) {
		// Try POSITRON_GITHUB_PAT (it's what the build script sets)
		githubPat = process.env.POSITRON_GITHUB_PAT;
	}

	// If no GITHUB_PAT is set, try to get it from git config. This provides a
	// convenient non-interactive way to set the PAT.
	if (!githubPat) {
		try {
			const { stdout, stderr } =
				await executeCommand('git config --get credential.https://api.github.com.token');
			githubPat = stdout.trim();
		} catch (error) {
			// We don't care if this fails; we'll try `git credential` next.
		}
	}

	// If no GITHUB_PAT is set, try to get it from git credential.
	if (!githubPat) {
		// Explain to the user what's about to happen.
		console.log(`Attempting to retrieve a Github Personal Access Token from git in order\n` +
			`to download Ark ${packageJsonVersion}. If you are prompted for a username and\n` +
			`password, enter your Github username and a Personal Access Token with the\n` +
			`'repo' scope. You can read about how to create a Personal Access Token here:\n` +
			`\n` +
			`https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens\n` +
			`\n` +
			`If you don't want to set up a Personal Access Token now, just press Enter and set\n` +
			`a blank value for the password. Ark will not be downloaded, but you will still be\n` +
			`able to run Positron without R support.\n` +
			`\n` +
			`You can set a PAT later by running yarn again and supplying the PAT at this prompt,\n` +
			`or by running 'git config credential.https://api.github.com.token ghp_a1b2c..'\n`);
		const { stdout, stderr } =
			await executeCommand('git credential fill',
				`protocol=https\n` +
				`host=api.github.com\n` +
				`path=/repos/posit-dev/amalthea/releases\n`);

		patIsApproved = false;
		// Extract the `password = ` line from the output.
		const passwordLine = stdout.split('\n').find(
			(line: string) => line.startsWith('password='));
		if (passwordLine) {
			githubPat = passwordLine.split('=')[1];
		}
	}

	if (!githubPat) {
		console.log(`No Github PAT was found. Unable to download Ark ${packageJsonVersion}.\n` +
			`You can still run Positron without R support.`);
		return;
	}

	await downloadAndReplaceArk(packageJsonVersion, githubPat, patIsApproved);
}

main().catch((error) => {
	console.error('An error occurred:', error);
});
