const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');

let ID = 0;

function createAsset(filename) {
  const content = fs.readFileSync(filename, 'utf-8');

  const ast = parser.parse(content, {sourceType: "module"});

  const dependencies = [];

  traverse(ast, {
    ImportDeclaration: ({node}) => {
      dependencies.push(node.source.value);
    }
  });

  const id = ID++;

  const {code} = babel.transformFromAst(ast, null, {presets: ['@babel/preset-env']});

  return {id, filename, dependencies, code};
}

function createGraph(entry) {
  const mainAsset = createAsset(entry);

  const queue = [mainAsset];

  for (const asset of queue) {
    const dirname = path.dirname(asset.filename);

    asset.mapping = {};

    asset.dependencies.forEach(relativePath => {
      const absolutePath = path.join(dirname, relativePath).replace(/\\/g, '/');
      const child = createAsset(absolutePath);
      asset.mapping[relativePath] = child.id;
      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = '';

  graph.forEach(mod => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  return `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];
        
        function localRequire(relativePath) {
          return require(mapping[relativePath]);
        }
        
        const module = { exports: {} };
        
        fn(localRequire, module, module.exports);
        
        return module.exports;
      }
      
      require(0);
    })({${modules}})
  `;
}

const graph = createGraph('./example/entry.js');
const result = bundle(graph);

console.log(result);
