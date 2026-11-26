// A project's source files: the names a source can have, #include paths, and adding / renaming / deleting a file.
// A project source name is a file name, or a path of up to six folders (`Core/Src/app.c`, as a CubeIDE project keeps its
// files). Folder and file names are letters, digits, _ . - and do not start with a dot, so `.` / `..` cannot appear.
// .s (startup code) and .ld (linker script) are the two other kinds a CubeIDE project holds; only the ARM build uses them.
// The code is in Rust (rust/stm-core/src/csedit.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable} from './rust-core.js';

const T=rustTable('source_tables');
export const SOURCE_PATH=new RegExp(T.path);
export const MAX_SOURCE_FILES=T.maxFiles,MAX_SOURCE_BYTES=T.maxBytes;
const baseOf=rustPure('base_name'),folderOfName=rustPure('folder_of');
export const baseName=name=>baseOf(name);
/**
 * Source text as the app keeps it: no byte order mark, lines ending in \n. CubeIDE on Windows writes \r\n, and the code
 * that edits sources by position or by line (main hooks, regeneration, moving user code, the notices that name a line)
 * is written for \n text, so imported and dropped files are brought to that form once, where they come in.
 */
export const normalizeText=text=>rustFn('normalize_text',text);
export const folderOf=name=>folderOfName(name);
/** The file an #include "x.h" / "dir/x.h" written in `from` means: the same folder first, then the path from the root, then any folder. */
export const resolveInclude=(names,include,from='')=>rustFn('resolve_include',[...names],include,from)??undefined;
/**
 * Why `name` cannot be added next to the sources `names`, or '': 'main' (main.c in any case or folder is the project's
 * main source), 'same' (the name exists, compared without case as Windows does), 'folder' (a file would have to be a
 * folder too: app.c next to app.c/x.c). A project with such names cannot be saved to disk or opened again.
 */
export const nameClash=(names,name)=>rustFn('name_clash',[...names],name);
export function sourceFiles(project){return [{name:'main.c',text:project.code},...(project.firmware?.files||[])];}
/** The project with a source file added, renamed or deleted (a copy; the #include lines that mean the file follow a rename). */
export function changeSourceFile(project,action,name,nextName){
 const part=rustFn('change_source_file',{code:project.code,firmware:project.firmware},action,typeof name==='string'?name:null,typeof nextName==='string'?nextName:null);
 const p=structuredClone(project);p.code=part.code;p.firmware=part.firmware;
 return p;
}
