import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { authenticate, requireCustomer } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  addAddressSchema,
  addressIdParamSchema,
  deliveryDetailsSchema,
  setDefaultAddressSchema,
  updateProfileSchema,
} from '../validators/customer.validators';

const router = Router();

router.get('/me', authenticate, requireCustomer, CustomerController.me);
router.patch('/me', authenticate, requireCustomer, validate(updateProfileSchema), CustomerController.updateMe);
router.put('/me/delivery-details', authenticate, requireCustomer, validate(deliveryDetailsSchema), CustomerController.saveDeliveryDetails);
router.get('/me/orders', authenticate, requireCustomer, CustomerController.myOrders);
router.post('/me/addresses', authenticate, requireCustomer, validate(addAddressSchema), CustomerController.addAddress);
router.patch('/me/addresses/:addressId/default', authenticate, requireCustomer, validate(setDefaultAddressSchema), CustomerController.setDefaultAddress);
router.delete('/me/addresses/:addressId', authenticate, requireCustomer, validate(addressIdParamSchema), CustomerController.removeAddress);
router.post('/me/favourites/:menuItemId', authenticate, requireCustomer, CustomerController.toggleFavourite);

export default router;
