const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
// Load a test document through the real file-input handler; no app test backdoor.
exports.openFixture=async(page,project)=>{
 if((await page.locator('#run').textContent()).includes('정지'))await page.click('#run');
 await page.locator('#file-input').setInputFiles({name:'fixture.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.waitForFunction(code=>document.getElementById('code').value===code,project.code);
 await page.click('[data-tab="code"]');
};
exports.chooseHal=async(page,kind)=>{await revealUiControl(page,'#hal-example');await page.selectOption('#hal-example',kind);};
// Fixture source replacement uses the same input bridge as the Monaco editor.
// Actual keyboard editing is covered by ide-smoke.cjs.
exports.fillCode=(page,text)=>page.locator('#code').evaluate((el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},text);
exports.newProject=async page=>{
 await clickUiControl(page,'#new');
 if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');
 await page.selectOption('#new-project-template','blank');
 await page.click('#project-create');
 try{await page.waitForSelector('#project-dialog',{state:'hidden'});}catch(error){throw new Error('Project creation failed: '+await page.locator('#project-form-error').textContent(),{cause:error});}
};

// A click only starts the async IPC operation. Wait for the app's completion
// message before reading the file or checking the newly opened document.
async function fileAction(page,button,message){
 await page.click('#clear-console');
 await clickUiControl(page,button);
 await page.waitForFunction(message=>document.getElementById('console-output').textContent.includes(message),message);
}
exports.saveProject=page=>fileAction(page,'#save','회로 파일을 저장했습니다.');
exports.openProject=page=>fileAction(page,'#open','회로를 열었습니다:');
