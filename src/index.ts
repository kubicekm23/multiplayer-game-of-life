import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3050;

app.get('/', (req: Request, res: Response) => {
  res.json({
    status: "online",
    message: "Site is working perfectly on Coolify!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint for Docker/Coolify
app.get('/health', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});