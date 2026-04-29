import express, { Request, Response } from 'express';
import path from 'path';
import { chooseMutation, createGame, forceResolve, GameSettings, QueuedAction, serializeGame, submitAction } from './game';

const app = express();
// Keep this 3000 for internal Docker use; 
// your docker-compose maps 3050 -> 3000
const PORT = process.env.PORT || 3000; 
let game = createGame();

// Explicitly set the views directory to be safe
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req: Request, res: Response) => {
  // Ensure layout.ejs exists in your /views folder
  res.render("layout", { "title": "Game of War", "body": "intro_page" });
});

app.get('/api/game', (req: Request, res: Response) => {
  res.json(serializeGame(game));
});

app.post('/api/game', (req: Request<unknown, unknown, Partial<GameSettings>>, res: Response) => {
  game = createGame(req.body);
  res.json(serializeGame(game));
});

app.post('/api/actions', (req: Request<unknown, unknown, QueuedAction>, res: Response) => {
  const result = submitAction(game, req.body);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json(serializeGame(game));
});

app.post('/api/mutations', (req: Request<unknown, unknown, { playerId: number; mutation: string }>, res: Response) => {
  const result = chooseMutation(game, req.body.playerId, req.body.mutation as never);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json(serializeGame(game));
});

app.post('/api/resolve', (req: Request, res: Response) => {
  forceResolve(game);
  res.json(serializeGame(game));
});

// Use 0.0.0.0 to ensure it's reachable outside the container
app.listen(PORT, () => {
  console.log(`Server is running internally on port ${PORT}`);
});
