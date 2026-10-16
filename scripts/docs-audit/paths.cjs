const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const {version}=require('../../package.json');
const directory=path.resolve(root,process.env.DOCS_AUDIT_OUT||`work/test-results/docs-audit-${version}`);
module.exports={root,version,directory,out:pathToFileURL(directory+path.sep)};
