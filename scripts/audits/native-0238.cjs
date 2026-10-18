// Run the existing native integration test against installed audit tools.
// This does not change the application's preferences or the user's profile.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../..'),filename=path.join(root,'scripts/native-ide-check.cjs');
const overrides={armGcc:path.join(root,'work/native-tools/xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe'),armGdb:path.join(root,'work/native-tools/xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gdb.exe'),clangd:path.join(root,'work/tools/clangd_23.1.0/bin/clangd.exe'),cube:path.join(root,'work/tools/STM32CubeF4')};
for(const file of Object.values(overrides))if(!fs.existsSync(file))throw Error('Missing audit tool: '+file);
let source=fs.readFileSync(filename,'utf8').replace('tools=await toolSettings()','tools=Object.assign(await toolSettings(),'+JSON.stringify(overrides)+')').replace('if(require.main===module)main()','main()');
const audit=new Module(filename,module);audit.filename=filename;audit.paths=Module._nodeModulePaths(path.dirname(filename));audit._compile(source,filename);
