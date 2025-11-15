const path = require("node:path");

const resolve = (pattern) => path.resolve(__dirname, pattern);

module.exports = {
    content: [resolve("./index.html"), resolve("./src/**/*.{ts,tsx}")],
    theme: {
        extend: {
            colors: {
                midnight: "#050914",
                accent: "#4cc9f0",
                warning: "#f7b267",
                success: "#7ae582"
            }
        }
    },
    plugins: []
};
