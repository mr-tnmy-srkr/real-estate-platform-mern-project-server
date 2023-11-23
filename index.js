const express = require("express");
const app = express();
const port = process.env.PORT || 6000;


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`🏡 Real Estate App is live and thriving on port ${port}! 🌟`)
})