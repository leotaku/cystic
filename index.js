import ergogen from "ergogen";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import yargs from "yargs";

async function generateErgogenResults(filename) {
  const doc = await fs.readFile(filename).then((it) => it.toString());
  return await ergogen.process(doc, true, () => null);
}

async function injectFootprints(directory) {
  for (const filename of await fs.readdir(directory)) {
    const name = path.parse(filename).name;
    console.log("Inject footprint:", name);
    const data = await import("./" + path.join(directory, filename));
    ergogen.inject("footprint", name, data.default);
  }
}

async function writeOutputFiles(data, directory) {
  await fs.mkdir(directory, { recursive: true });
  for (const [name, content] of new Map(Object.entries(data.pcbs))) {
    const filename = path.join(directory, name + ".kicad_pcb");
    console.log("Write file:", filename);
    await fs.writeFile(filename, content);
  }
}

const html = `
<!DOCTYPE html>
<html>
  <head>
    <style>
    svg {
      max-width: 100%;
      max-height: 100%;
    }
    </style>
  </head>
  <body>
    <div id="target">Edit ergogen.yml to see changes live!</div>
    <select id="select">
    </select>
    <script>
      function setOptions(select, data) {
        const mappings = new Map(Object.entries(Object.assign({ demo: data.demo }, data.outlines)));
        const options = new Map(Array.from(select.childNodes).map((it) => [it.innerText, it]));

        for (const [key, value] of mappings) {
          if (key.startsWith("_")) {
            continue;
          } else if (options.get(key)) {
            options.get(key).value = value.svg;
          } else {
            const option = document.createElement("option");
            option.innerText = key;
            option.value = value.svg;
            select.appendChild(option);
          }
        }

        for (const [key, option] of options) {
          if (!mappings.get(key)) {
            option.remove();
          }
        }
      }

      const select = document.getElementById("select");
      const target = document.getElementById("target");
      select.addEventListener('change', (event) => {
         target.innerHTML = event.target.value;
      });

      const source = new EventSource('/reload')
      source.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        setOptions(select, data);
        target.innerHTML = select.value;
      })
      source.addEventListener('error', (event) => {
        window.location.reload();
      })
    </script>
  </body>
</html>
`;

const requestListener = (filename, initial) => (req, res) => {
  switch (req.url) {
    case "/reload":
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: " + JSON.stringify(initial) + "\n\n");

      (async () => {
        const watcher = fs.watch(filename);
        for await (const event of watcher) {
          try {
            let results = await generateErgogenResults(filename);
            res.write("data: " + JSON.stringify(results) + "\n\n");
            console.log("Reload...");
          } catch (err) {
            console.log(err);
          }
        }
      })();
      break;
    default:
      res.writeHead(200, {
        "Content-Type": "text/html",
      });
      res.end(html);
  }
};

yargs()
  .scriptName("cystic-cli")
  .usage("$0 <cmd> [args]")
  .command({
    command: "build <config>",
    description: "Build full Ergogen configuration",
    builder: (yargs) => {
      yargs.option("output", {
        description: "Output directory",
        demandOption: true,
      });
    },
    handler: async (argv) => {
      await injectFootprints("footprints");
      console.log("Generate ergogen:", filename);
      const data = await generateErgogenResults(argv.config);
      await writeOutputFiles(data, argv.output);
    },
  })
  .command({
    command: "preview <config>",
    description: "Run auto-reloading Ergogen preview server",
    handler: async (argv) => {
      await injectFootprints("footprints");

      var initial = undefined;
      try {
        console.log("Generating ergogen:", argv.config);
        initial = await generateErgogenResults(argv.config);
      } catch (err) {
        console.log(err);
      }

      console.log("Starting server at:", "http://localhost:8080/");
      const server = http.createServer(requestListener(argv.config, initial));
      server.listen(8080);
    },
  })
  .demandCommand(1)
  .parse(process.argv.slice(2));
