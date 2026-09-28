import { Router } from 'express';
import { MenuController } from '../controllers/menu.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { handleMenuImageUpload } from '../middleware/upload';
import { createMenuCategorySchema, createMenuItemSchema, updateMenuItemSchema } from '../validators/order.validators';

const router = Router();

// Public - customer-facing browsing
router.get('/', MenuController.getFullMenu);
router.get('/categories', MenuController.listCategories);
router.get('/items', MenuController.listItems);
router.get('/items/:id', MenuController.getItemById);
router.get('/modifiers', MenuController.listModifiers);
router.get('/table/:qrToken', MenuController.resolveTable);

// Staff-managed
router.post('/categories', authenticate, requireStaff, authorize('menu.manage'), validate(createMenuCategorySchema), MenuController.createCategory);
router.post('/items', authenticate, requireStaff, authorize('menu.manage'), validate(createMenuItemSchema), MenuController.createItem);
router.post('/items/upload-image', authenticate, requireStaff, authorize('menu.manage'), handleMenuImageUpload, MenuController.uploadImage);
router.patch('/items/:id', authenticate, requireStaff, authorize('menu.manage'), validate(updateMenuItemSchema), MenuController.updateItem);
router.patch('/items/:id/availability', authenticate, requireStaff, authorize('menu.manage'), MenuController.setAvailability);
router.post('/modifiers', authenticate, requireStaff, authorize('menu.manage'), MenuController.createModifier);

export default router;
