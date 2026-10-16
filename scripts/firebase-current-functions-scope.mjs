// Enumerate ONLY Cloud Functions present in the deployed source tree.
// Explicit --only functions:name targets preserve obsolete deployed functions
// without Firebase's interactive (and unsafe) deletion prompt.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const filename = 'functions/src/index.ts';
const source = ts.createSourceFile(
  filename, readFileSync(filename, 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);
const names = [];
const hasExport = node => node.modifiers?.some(modifier =>
  modifier.kind === ts.SyntaxKind.ExportKeyword);
for (const statement of source.statements) {
  if (ts.isVariableStatement(statement) && hasExport(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !ts.isCallExpression(declaration.initializer)) {
        throw new Error('Unsupported top-level Cloud Function export in ' + filename);
      }
      const callee = declaration.initializer.expression;
      const factory = ts.isIdentifier(callee) ? callee.text : '';
      if (!/^on(Call|Request|Schedule|DocumentCreated|DocumentWritten|DocumentUpdated|DocumentDeleted)$/.test(factory)) {
        throw new Error('Unexpected exported function initializer for ' + declaration.name.text + ': ' + factory);
      }
      names.push(declaration.name.text);
    }
  } else if (ts.isExportDeclaration(statement) && statement.exportClause &&
             ts.isNamedExports(statement.exportClause)) {
    if (statement.isTypeOnly) continue;
    for (const element of statement.exportClause.elements) {
      if (!element.isTypeOnly) names.push(element.name.text);
    }
  } else if (ts.isExportDeclaration(statement) && !statement.exportClause) {
    throw new Error('Wildcard exports require review before live Cloud Functions deployment');
  }
}
const unique = [...new Set(names)];
if (unique.length !== names.length || names.length < 250 || names.length > 400 ||
    names.some(name => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
  throw new Error('Cloud Functions scope is incomplete, duplicated or malformed.');
}
for (const name of [
  'ageStatus', 'getReleasePlaybackUrl', 'myDiditControlledCheck',
  'startMyDiditControlledCheck', 'diditWebhook', 'processDiditWebhook',
  'nightjarGiftConfig', 'myNightjarWallet',
]) {
  if (!unique.includes(name)) throw new Error('Mandatory function missing from deploy scope: ' + name);
}
if (process.argv.includes('--validate')) {
  process.stderr.write('Non-deleting Cloud Functions scope validated: ' + unique.length + ' exports.\n');
} else {
  process.stdout.write(unique.map(name => 'functions:' + name).join(',') + '\n');
}
