module.exports = {
  apps : [
    {
      name: "queued-app-server",
      script: "sudo node ./shared-spotify-queue-backend/index.js",
      watch: true,
      env: {
        "NODE_ENV": "development",
      },
      env_production : {
       "NODE_ENV": "production"
      }
    },
    {
      name: "queued-app-auth",
      script: "node ./server/index.js",
      watch: true,
      env: {
        "NODE_ENV": "development",
      },
      env_production : {
        "NODE_ENV": "production"
      }
    },
    {
      name: "queued-app-client",
      script: "serve -s ./shared-spotify-queue/build -p 3000",
      watch: true,
      env: {
        "NODE_ENV": "development",
      },
      env_production: {
        "NODE_ENV": "production"
      }
    }
  ]
}
