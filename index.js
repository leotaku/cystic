import ergogen from "ergogen";
import fs from "node:fs/promises";
import http from "node:http";

const filename = process.argv.slice(2)[0] || "ergogen.yml";

const html = `
<!DOCTYPE html>
<html>
  <head>
    <script>
      var source = new EventSource('/reload')
      source.addEventListener('message', (event) => {
        document.getElementById("target").innerHTML = event.data;
      }, false)
      source.addEventListener('error', (event) => {
        window.location.reload();
      })
    </script>
    <style>
    svg {
      max-width: 100%;
      max-height: 100%;
    }
    </style>
  </head>
  <body>
    <div id="target">Edit ergogen.yml to see changes live!</div>
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
          res.write("data: " + results.demo.svg + "\n\n");
        } catch (err) {
          console.log(err);
        }

        for await (const event of watcher) {
          try {
            let results = await generateErgogenResults(filename);
            res.write("data: " + results.demo.svg + "\n\n");
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
