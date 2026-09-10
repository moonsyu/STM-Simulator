// Load a test document through the real file-input handler; no app test backdoor.
exports.openFixture=async(page,project)=>{
 if((await page.locator('#run').textContent()).includes('정지'))await page.click('#run');
 await page.locator('#file-input').setInputFiles({name:'fixture.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.waitForFunction(code=>document.getElementById('code').value===code,project.code);
 await page.click('[data-tab="code"]');
};
exports.chooseHal=async(page,kind)=>{await page.selectOption('#hal-example',kind);};

// A click only starts the async IPC operation. Wait for the app's completion
// message before reading the file or checking the newly opened document.
async function fileAction(page,button,message){
 await page.click('#clear-console');
 await page.click(button);
 await page.waitForFunction(message=>document.getElementById('console-output').textContent.includes(message),message);
}
exports.saveProject=page=>fileAction(page,'#save','회로 파일을 저장했습니다.');
exports.openProject=page=>fileAction(page,'#open','회로를 열었습니다:');
