import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');
const profileDir = path.join(uploadRoot, 'profile-photos');
const docsDir = path.join(uploadRoot, 'teacher-documents');

[uploadRoot, profileDir, docsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === 'profilePhoto' ? profileDir : docsDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

export const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });