module.exports = {
  apps: [
    {
      name: "cu-1",
      script: "./src/app.mjs",
      env: {
        "PORT": "8091"
      },
    },
    {
      name: "cu-2",
      script: "./src/app.mjs",
      env: {
        "PORT": "8092"
      },
    },
    {
      name: "cu-3",
      script: "./src/app.mjs",
      env: {
        "PORT": "8093"
      },
    }]
}
