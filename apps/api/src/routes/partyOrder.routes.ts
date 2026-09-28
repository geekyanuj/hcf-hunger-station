import { Router } from 'express';
import { PartyOrderController } from '../controllers/partyOrder.controller';
import { optionalAuthenticate, authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { submitPartyOrderSchema, addQuotationSchema, convertPartyOrderSchema } from '../validators/growth.validators';

const router = Router();

router.post('/', optionalAuthenticate, validate(submitPartyOrderSchema), PartyOrderController.submit);
router.get('/', authenticate, requireStaff, authorize('party.manage'), PartyOrderController.list);
router.get('/:id', authenticate, requireStaff, authorize('party.manage'), PartyOrderController.getById);
router.post('/:id/contacted', authenticate, requireStaff, authorize('party.manage'), PartyOrderController.markContacted);
router.post('/:id/quotation', authenticate, requireStaff, authorize('party.manage'), validate(addQuotationSchema), PartyOrderController.addQuotation);
router.post('/:id/approve', authenticate, requireStaff, authorize('party.manage'), PartyOrderController.approve);
router.post('/:id/reject', authenticate, requireStaff, authorize('party.manage'), PartyOrderController.reject);
router.post('/:id/convert', authenticate, requireStaff, authorize('party.manage'), validate(convertPartyOrderSchema), PartyOrderController.convert);

export default router;
