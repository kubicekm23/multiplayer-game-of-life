import express, { Request, Response } from 'express';
import path from 'path';

const app = express();
// Keep this 3000 for internal Docker use; 
// your docker-compose maps 3050 -> 3000
const PORT = process.env.PORT || 3000; 

// Explicitly set the views directory to be safe
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

app.get('/', (req: Request, res: Response) => {
  // Ensure layout.ejs exists in your /views folder
  res.render("layout", { "title": "ConGame", "body": "intro_page" });
});

// Use 0.0.0.0 to ensure it's reachable outside the container
app.listen(PORT, () => {
  console.log(`🚀 Server is running internally on port ${PORT}`);
});