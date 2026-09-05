import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import studentRoutes from './routes/studentRoutes';
import departmentRoutes from './routes/departmentRoutes';
import path from 'path';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'College portal API is running. Open the frontend at http://localhost:5173 to use the app.',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'College portal backend is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/departments', departmentRoutes);
// after
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, '..', 'uploads')),
);
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

export default app;
