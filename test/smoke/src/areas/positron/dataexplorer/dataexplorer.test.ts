/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/


import { expect } from '@playwright/test';
import { Application, Logger, PositronPythonFixtures, PositronRFixtures } from '../../../../../automation';
import { installAllHandlers } from '../../../utils';


export function setup(logger: Logger) {
	describe('Data Explorer', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		describe('Python Data Explorer', () => {

			before(async function () {

				const app = this.app as Application;

				const pythonFixtures = new PositronPythonFixtures(app);
				await pythonFixtures.startPythonInterpreter();

			});

			after(async function () {

				const app = this.app as Application;

				await app.workbench.positronDataExplorer.closeDataExplorer();
				await app.workbench.positronVariables.openVariables();

			});

			it('Python - Verifies basic data explorer functionality', async function () {
				const app = this.app as Application;

				// modified snippet from https://www.geeksforgeeks.org/python-pandas-dataframe/
				const script = `import pandas as pd
data = {'Name':['Jai', 'Princi', 'Gaurav', 'Anuj'],
		'Age':[27, 24, 22, 32],
		'Address':['Delhi', 'Kanpur', 'Allahabad', 'Kannauj']}
df = pd.DataFrame(data)`;

				console.log('Sending code to console');
				await app.workbench.positronConsole.executeCode('Python', script, '>>>');

				console.log('Opening data grid');
				await app.workbench.positronVariables.doubleClickVariableRow('df');

				await app.workbench.positronSideBar.closeSecondarySideBar();

				const tableData = await app.workbench.positronDataExplorer.getDataExplorerTableData();

				expect(tableData[0]).toStrictEqual({ 'Name': 'Jai', 'Age': '27', 'Address': 'Delhi' });
				expect(tableData[1]).toStrictEqual({ 'Name': 'Princi', 'Age': '24', 'Address': 'Kanpur' });
				expect(tableData[2]).toStrictEqual({ 'Name': 'Gaurav', 'Age': '22', 'Address': 'Allahabad' });
				expect(tableData[3]).toStrictEqual({ 'Name': 'Anuj', 'Age': '32', 'Address': 'Kannauj' });
				expect(tableData.length).toBe(4);

			});
		});

		describe('R Data Explorer', () => {

			before(async function () {
				const app = this.app as Application;

				const rFixtures = new PositronRFixtures(app);
				await rFixtures.startRInterpreter();

			});

			after(async function () {

				const app = this.app as Application;

				await app.workbench.positronDataExplorer.closeDataExplorer();
				await app.workbench.positronVariables.openVariables();

			});

			it('R - Verifies basic data explorer functionality', async function () {
				const app = this.app as Application;

				// snippet from https://www.w3schools.com/r/r_data_frames.asp
				const script = `Data_Frame <- data.frame (
	Training = c("Strength", "Stamina", "Other"),
	Pulse = c(100, 150, 120),
	Duration = c(60, 30, 45)
)`;

				console.log('Sending code to console');
				await app.workbench.positronConsole.executeCode('R', script, '>');

				console.log('Opening data grid');
				await app.workbench.positronVariables.doubleClickVariableRow('Data_Frame');

				await app.workbench.positronSideBar.closeSecondarySideBar();

				const tableData = await app.workbench.positronDataExplorer.getDataExplorerTableData();

				expect(tableData[0]).toStrictEqual({ 'Training': 'Strength', 'Pulse': '100', 'Duration': '60' });
				expect(tableData[1]).toStrictEqual({ 'Training': 'Stamina', 'Pulse': '150', 'Duration': '30' });
				expect(tableData[2]).toStrictEqual({ 'Training': 'Other', 'Pulse': '120', 'Duration': '45' });
				expect(tableData.length).toBe(3);

			});
		});
	});
}
