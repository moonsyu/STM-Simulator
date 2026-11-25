// The optimisation level of a build (feature 54): CubeIDE's MCU GCC Compiler › Optimization › "Optimization level",
// chosen for the Debug and the Release configuration and stored in the project (ide.native.optimization). The levels
// and their checking are in Rust (rust/stm-core/src/build_level.rs); both configurations start at None (-O0).
import {rustCall} from './rust-core.js';

const table=rustCall('build_levels');
/** [{flag:'-O0', label:'None (-O0)'}, …] in CubeIDE's order. */
export const BUILD_LEVELS=Object.freeze(table.levels.map(Object.freeze));
export const BUILD_CONFIGURATIONS=Object.freeze(table.configurations);
export const DEFAULT_BUILD_LEVEL=table.default;
/** What a project stores: {Debug?, Release?} without the default level. Throws on anything that is not a level. */
export const buildLevelSettings=value=>rustCall('build_level_settings',{value:value??null});
/** The compiler flag of a project's build in `configuration` (-O0 unless the project chose another level). */
export const buildLevelFlag=(project,configuration)=>rustCall('build_level_flag',{stored:project?.ide?.native?.optimization??null,configuration});
/** `native` (ide.native) with `flag` chosen for `configuration`. */
export function withBuildLevel(native,configuration,flag){
 const optimization=buildLevelSettings({...native?.optimization,[configuration]:flag}),{optimization:_old,...rest}=native||{};
 return Object.keys(optimization).length?{...rest,optimization}:rest;
}
