// Load a test document through the real file-input handler; no app test backdoor.
exports.openFixture=async(page,project)=>{
 if((await page.locator('#run').textContent()).includes('정지'))await page.click('#run');
 await page.locator('#file-input').setInputFiles({name:'fixture.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.waitForFunction(code=>document.getElementById('code').value===code,project.code);
 await page.click('[data-tab="code"]');
};
exports.chooseHal=async(page,kind)=>{await page.selectOption('#hal-example',kind);await page.click('#hal-example-confirm');};
