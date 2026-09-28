import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, requireStaff } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate, requireStaff, authorize('analytics.read'));

router.get('/revenue-over-time', AnalyticsController.revenueOverTime);
router.get('/order-type-distribution', AnalyticsController.orderTypeDistribution);
router.get('/top-products', AnalyticsController.topProducts);
router.get('/category-performance', AnalyticsController.categoryPerformance);
router.get('/payment-methods', AnalyticsController.paymentMethodBreakdown);
router.get('/purchase-trend', AnalyticsController.purchaseTrend);
router.get('/wastage-trend', AnalyticsController.wastageTrend);
router.get('/food-cost', AnalyticsController.foodCost);
router.get('/outlet-performance', AnalyticsController.outletPerformance);
router.get('/staff-performance', AnalyticsController.staffPerformance);

export default router;
