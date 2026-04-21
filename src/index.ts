import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3050;

app.get('/', (req: Request, res: Response) => {
  res.render("layout.ejs", {"title": "ConGame", "body": "intro_page"});
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});