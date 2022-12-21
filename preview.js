import ergogen from "ergogen";
import fs from "node:fs/promises";
import http from "node:http";

const filename = process.argv.slice(2)[0] || "ergogen.yml";

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

async function generateErgogenResults(filename) {
  const doc = await fs.readFile(filename).then((it) => it.toString());
  return await ergogen.process(doc, true, () => null);
}

const requestListener = function (req, res) {
  switch (req.url) {
    case "/reload":
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      (async () => {
        const watcher = fs.watch(filename);

        try {
          let results = await generateErgogenResults(filename);
          res.write("data: " + JSON.stringify(results) + "\n\n");
        } catch (err) {
          console.log(err);
        }

        for await (const event of watcher) {
          try {
            let results = await generateErgogenResults(filename);
            res.write("data: " + JSON.stringify(results) + "\n\n");
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

console.log("Handling file:", filename);
console.log("Starting server at:", "http://localhost:8080/");

const server = http.createServer(requestListener);
server.listen(8080);
