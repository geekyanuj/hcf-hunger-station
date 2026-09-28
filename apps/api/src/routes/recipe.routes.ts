import { Router } from 'express';
import { RecipeController } from '../controllers/recipe.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { upsertRecipeSchema } from '../validators/inventory.validators';

const router = Router();

router.get('/', authenticate, requireStaff, authorize('inventory.read'), RecipeController.list);
router.get('/:menuItemId', authenticate, requireStaff, authorize('inventory.read'), RecipeController.getForMenuItem);
router.get('/:menuItemId/cost', authenticate, requireStaff, authorize('inventory.read'), RecipeController.cost);
router.post('/', authenticate, requireStaff, authorize('recipes.manage'), validate(upsertRecipeSchema), RecipeController.upsert);
router.delete('/:menuItemId', authenticate, requireStaff, authorize('recipes.manage'), RecipeController.remove);

export default router;
