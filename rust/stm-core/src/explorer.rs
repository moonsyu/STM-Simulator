//! The explorer's project tree (feature 56): the whole project under "소스 파일" as STM32CubeIDE's Project Explorer
//! shows it — Includes, Core (Inc, Src, Startup), Drivers, the linker script and the .ioc — and the text of the files
//! CubeMX writes that the tree had not shown: the header every generated file starts with, `stm32xxxx_it.h` and
//! `stm32xxxx_hal_msp.c`.

use serde_json::{json, Value};

/// A folder of the tree. `rows` are indexes into the list of paths the tree was made from.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Folder {
    pub name: String,
    pub path: String,
    pub folders: Vec<Folder>,
    pub rows: Vec<usize>,
    /// The "Includes" node: the include directories of the build, shown as names only.
    pub includes: Vec<String>,
}

fn key(name: &str) -> (String, &str) {
    (name.to_ascii_lowercase(), name)
}

fn leaf(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// The tree of `paths` (the place of each file in the project, folders separated by '/'). Folders come first, in
/// alphabetical order, then the files of the folder in alphabetical order (upper and lower case together); the
/// "Includes" node, when there are include directories, is the first entry of the project, as in CubeIDE.
pub fn tree(paths: &[String], includes: &[String]) -> Folder {
    let mut root = Folder::default();
    for (index, path) in paths.iter().enumerate() {
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        let Some((_, folders)) = parts.split_last() else {
            continue;
        };
        let mut node = &mut root;
        let mut full = String::new();
        for part in folders {
            if !full.is_empty() {
                full.push('/');
            }
            full.push_str(part);
            let at = match node.folders.iter().position(|f| f.name == *part) {
                Some(at) => at,
                None => {
                    node.folders.push(Folder {
                        name: (*part).to_string(),
                        path: full.clone(),
                        ..Folder::default()
                    });
                    node.folders.len() - 1
                }
            };
            node = &mut node.folders[at];
        }
        node.rows.push(index);
    }
    sort(&mut root, paths);
    if !includes.is_empty() {
        root.folders.insert(
            0,
            Folder {
                name: "Includes".to_string(),
                path: "Includes".to_string(),
                includes: includes.to_vec(),
                ..Folder::default()
            },
        );
    }
    root
}

fn sort(node: &mut Folder, paths: &[String]) {
    node.folders.sort_by(|a, b| key(&a.name).cmp(&key(&b.name)));
    node.rows
        .sort_by(|a, b| key(leaf(&paths[*a])).cmp(&key(leaf(&paths[*b]))));
    for child in &mut node.folders {
        sort(child, paths);
    }
}

pub fn to_json(node: &Folder) -> Value {
    json!({
        "name": node.name,
        "path": node.path,
        "folders": node.folders.iter().map(to_json).collect::<Vec<_>>(),
        "rows": node.rows,
        "includes": node.includes,
    })
}

const RULE: &str =
    "  ******************************************************************************";

/// The header CubeMX puts on top of a file it generates, in its own USER CODE section. `brief` may have several lines.
pub fn cube_header(file: &str, brief: &str) -> String {
    let mut lines = vec![
        "/* USER CODE BEGIN Header */".to_string(),
        "/**".to_string(),
        RULE.to_string(),
        format!("  * @file    {file}"),
    ];
    for (i, line) in brief.lines().enumerate() {
        lines.push(if i == 0 {
            format!("  * @brief   {line}")
        } else {
            format!("  *          {line}")
        });
    }
    lines.extend([
        RULE.to_string(),
        "  */".to_string(),
        "/* USER CODE END Header */".to_string(),
    ]);
    lines.join("\n")
}

/// `stm32xxxx_it.h`: the prototypes of the handlers `stm32xxxx_it.c` defines.
pub fn it_header(prefix: &str, handlers: &[String]) -> String {
    let file = format!("{prefix}_it.h");
    let guard = format!("__{}_IT_H", prefix.to_ascii_uppercase().replace("XX", "xx"));
    let mut lines = vec![
        cube_header(
            &file,
            "This file contains the headers of the interrupt handlers.",
        ),
        String::new(),
        "/* Define to prevent recursive inclusion -------------------------------------*/"
            .to_string(),
        format!("#ifndef {guard}"),
        format!("#define {guard}"),
        String::new(),
        "#ifdef __cplusplus".to_string(),
        "extern \"C\" {".to_string(),
        "#endif".to_string(),
        String::new(),
        "/* USER CODE BEGIN Includes */".to_string(),
        "/* USER CODE END Includes */".to_string(),
        String::new(),
        "/* Exported functions prototypes ---------------------------------------------*/"
            .to_string(),
    ];
    lines.extend(handlers.iter().map(|h| format!("void {h}(void);")));
    lines.extend(
        [
            "/* USER CODE BEGIN EFP */",
            "/* USER CODE END EFP */",
            "",
            "#ifdef __cplusplus",
            "}",
            "#endif",
            "",
        ]
        .map(str::to_string),
    );
    lines.push(format!("#endif /* {guard} */"));
    lines.push(String::new());
    lines.join("\n")
}

/// `stm32xxxx_hal_msp.c`: HAL_MspInit, which HAL_Init calls. The peripheral init code of this app's generator sets
/// up clocks and pins inside the MX_*_Init functions, so the function has its USER CODE sections only — the same as
/// the HAL's weak default until something is written there.
pub fn hal_msp(prefix: &str) -> String {
    let file = format!("{prefix}_hal_msp.c");
    [
        cube_header(
            &file,
            "This file provides code for the MSP Initialization\nand de-Initialization codes.",
        )
        .as_str(),
        "",
        "#include \"main.h\"",
        "",
        "/* USER CODE BEGIN Includes */",
        "/* USER CODE END Includes */",
        "",
        "/* USER CODE BEGIN 0 */",
        "/* USER CODE END 0 */",
        "",
        "/**",
        "  * Initializes the Global MSP.",
        "  */",
        "void HAL_MspInit(void)",
        "{",
        "  /* USER CODE BEGIN MspInit 0 */",
        "",
        "  /* USER CODE END MspInit 0 */",
        "",
        "  /* USER CODE BEGIN MspInit 1 */",
        "",
        "  /* USER CODE END MspInit 1 */",
        "}",
        "",
        "/* USER CODE BEGIN 1 */",
        "/* USER CODE END 1 */",
        "",
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_project_as_cubeide_lists_it() {
        let files = paths(&[
            "Core/Src/main.c",
            "test.ioc",
            "Core/Src/usart.c",
            "Drivers/CMSIS/Include/core_cm3.h",
            "Core/Inc/main.h",
            "STM32F103RBTX_FLASH.ld",
            "Core/Startup/startup_stm32f103rbtx.s",
            "Core/Src/gpio.c",
        ]);
        let root = tree(&files, &paths(&["Core/Inc", "Drivers/CMSIS/Include"]));
        assert_eq!(
            root.folders
                .iter()
                .map(|f| f.name.as_str())
                .collect::<Vec<_>>(),
            ["Includes", "Core", "Drivers"]
        );
        assert_eq!(
            root.folders[0].includes,
            ["Core/Inc", "Drivers/CMSIS/Include"]
        );
        // The files of the project folder: the linker script, then the .ioc.
        assert_eq!(
            root.rows
                .iter()
                .map(|i| files[*i].as_str())
                .collect::<Vec<_>>(),
            ["STM32F103RBTX_FLASH.ld", "test.ioc"]
        );
        let core = &root.folders[1];
        assert_eq!(
            core.folders
                .iter()
                .map(|f| f.path.as_str())
                .collect::<Vec<_>>(),
            ["Core/Inc", "Core/Src", "Core/Startup"]
        );
        assert_eq!(
            core.folders[1]
                .rows
                .iter()
                .map(|i| leaf(&files[*i]))
                .collect::<Vec<_>>(),
            ["gpio.c", "main.c", "usart.c"]
        );
        assert_eq!(
            to_json(&root)["folders"][2]["folders"][0]["path"],
            "Drivers/CMSIS"
        );
        // Without include directories there is no Includes node (an FSP project).
        assert_eq!(
            tree(&paths(&["src/hal_entry.c"]), &[]).folders[0].name,
            "src"
        );
    }

    #[test]
    fn the_files_cubemx_writes() {
        let header = cube_header(
            "gpio.c",
            "This file provides code for the configuration\nof all used GPIO pins.",
        );
        assert!(header.starts_with("/* USER CODE BEGIN Header */\n/**\n  ****"));
        assert!(header.contains("  * @file    gpio.c\n  * @brief   This file provides code for the configuration\n  *          of all used GPIO pins.\n"));
        assert!(header.ends_with("  */\n/* USER CODE END Header */"));
        let it = it_header(
            "stm32f1xx",
            &paths(&["SysTick_Handler", "USART2_IRQHandler"]),
        );
        assert!(it.contains("#ifndef __STM32F1xx_IT_H\n#define __STM32F1xx_IT_H\n"));
        assert!(it.contains(
            "void SysTick_Handler(void);\nvoid USART2_IRQHandler(void);\n/* USER CODE BEGIN EFP */"
        ));
        assert!(it.ends_with("#endif /* __STM32F1xx_IT_H */\n"));
        let msp = hal_msp("stm32f4xx");
        assert!(msp.contains("  * @file    stm32f4xx_hal_msp.c\n"));
        assert!(msp.contains("void HAL_MspInit(void)\n{\n  /* USER CODE BEGIN MspInit 0 */\n\n  /* USER CODE END MspInit 0 */\n\n  /* USER CODE BEGIN MspInit 1 */"));
    }
}
