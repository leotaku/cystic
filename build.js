import ergogen from "ergogen";
import fs from "node:fs/promises";
import path from "node:path";

async function generateErgogenResults(filename) {
  const doc = await fs.readFile(filename).then((it) => it.toString());
  return await ergogen.process(doc, true, () => null);
}

async function injectFootprints(directory) {
  const results = [];
  for (const filename of await fs.readdir(directory)) {
    const name = path.parse(filename).name;
    const data = await import("./" + path.join(directory, filename));
    ergogen.inject("footprint", name, data.default);
    results.push(name);
  }

  return results;
}

async function writeOutputFiles(data, directory) {
  const results = [];
  await fs.mkdir(directory, { recursive: true });
  for (const [name, content] of new Map(Object.entries(data.pcbs))) {
    const filename = path.join(directory, name + ".kicad_pcb");
    await fs.writeFile(filename, content);
    results.push(filename);
  }

  return results;
}

// Arguments
const [filename, output] = process.argv.slice(2, 4);

// Generate files
const footprints = await injectFootprints("footprints");
console.log("Injected footprints:", footprints.join(", "));
const data = await generateErgogenResults(filename);
console.log("Generated ergogen:", filename);
const files = await writeOutputFiles(data, output);
console.log("Files written:", files.join(", "));
