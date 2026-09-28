import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { authenticate, requireCustomer } from '../middleware/authenticate';

const router = Router();

router.get('/me', authenticate, requireCustomer, CustomerController.me);
router.patch('/me', authenticate, requireCustomer, CustomerController.updateMe);
router.get('/me/orders', authenticate, requireCustomer, CustomerController.myOrders);
router.post('/me/addresses', authenticate, requireCustomer, CustomerController.addAddress);
router.delete('/me/addresses/:addressId', authenticate, requireCustomer, CustomerController.removeAddress);
router.post('/me/favourites/:menuItemId', authenticate, requireCustomer, CustomerController.toggleFavourite);

export default router;
