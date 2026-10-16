// The whole API as one Vercel Function, for a deployment on Vercel (packages/api/vercel.json sends
// every path here). Long-running hosts — the Docker image, Render, a VM — run dist/main.js instead.
const { createApp } = require('../dist/bootstrap');

let ready;

module.exports = async function yusrApi(req, res) {
  ready ??= createApp()
    .then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance();
    })
    .catch((error) => {
      ready = undefined; // let the next request try again
      throw error;
    });
  const handle = await ready;
  return handle(req, res);
};
