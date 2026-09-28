import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';

const router = Router();

router.get('/', authenticate, requireStaff, SearchController.search);

export default router;
