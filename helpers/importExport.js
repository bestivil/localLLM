import { Parser } from "acorn";
import * as acornWalk from "acorn-walk";
/**
 * Analyzes a file to find its exports.
 * @param {string} filePath - Path to the file to analyze
 * @returns {Promise<{exports: string[]}>} Object containing arrays of export names
 */
export async function getExportsFromFile(filePath) {
  const acorn = await import("acorn");
  const walk = await import("acorn-walk");
  const fs = await import("fs/promises");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const ast = acorn.Parser.parse(content, {
      sourceType: "module",
      ecmaVersion: "latest",
    });

    const exports = {
      named: new Set(),
      default: null,
      namespaces: new Set(),
    };

    walk.simple(ast, {
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          if (node.declaration.type === "VariableDeclaration") {
            node.declaration.declarations.forEach((decl) => {
              if (decl.id.name) exports.named.add(decl.id.name);
            });
          } else if (node.declaration.id?.name) {
            exports.named.add(node.declaration.id.name);
          }
        }
        node.specifiers?.forEach((spec) => {
          if (spec.exported?.name) exports.named.add(spec.exported.name);
        });
      },
      ExportDefaultDeclaration() {
        exports.default = true;
      },
      ExportAllDeclaration(node) {
        if (node.exported) {
          exports.namespaces.add(node.exported.name);
        }
      },
    });

    return {
      exports: [
        ...exports.named,
        ...(exports.default ? ["default"] : []),
        ...exports.namespaces,
      ],
    };
  } catch (error) {
    console.error(`Error analyzing exports in ${filePath}:`, error);
    throw error;
  }
}

export async function getImportsFromFile(filePath) {
  const acorn = await import("acorn");
  const walk = await import("acorn-walk");
  const fs = await import("fs/promises");

  const content = await fs.readFile(filePath, "utf-8");
  const ast = Parser.parse(content, {
    sourceType: "module",
    ecmaVersion: "latest",
    locations: false,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    allowSuperOutsideMethod: true,
    allowHashBang: true,
  });

  const imports = [];

  acornWalk.simple(ast, {
    ImportDeclaration(node) {
      if (node.source && typeof node.source.value === "string") {
        const packageName = node.source.value;
        node.specifiers.forEach((specifier) => {
          if (specifier.local?.name) {
            imports.push({
              function: specifier.local.name,
              package: packageName,
            });
          }
        });
        if (node.specifiers.length === 0) {
          imports.push({ package: packageName });
        }
      }
    },
    ExportNamedDeclaration(node) {
      if (node.source && typeof node.source.value === "string") {
        const packageName = node.source.value;
        node.specifiers.forEach((specifier) => {
          if (specifier.local?.name) {
            imports.push({
              function: specifier.local.name,
              package: packageName,
            });
          }
        });
      }
    },
    ExportAllDeclaration(node) {
      if (node.source && typeof node.source.value === "string") {
        const packageName = node.source.value;
        if (node.exported) {
          imports.push({
            function: node.exported.name,
            package: packageName,
          });
        } else {
          imports.push({ package: packageName });
        }
      }
    },
    ImportExpression(node) {
      if (
        node.source?.type === "Literal" &&
        typeof node.source.value === "string"
      ) {
        imports.push({ package: node.source.value });
      }
    },
    CallExpression(node) {
      if (
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        node.arguments.length > 0 &&
        node.arguments[0].type === "Literal" &&
        typeof node.arguments[0].value === "string"
      ) {
        imports.push({ package: node.arguments[0].value });
      }
    },
  });

  return imports;
}
