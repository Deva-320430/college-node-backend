import app from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`College portal backend running on http://localhost:${env.port}`);
});
