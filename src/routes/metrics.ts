import { Router } from 'express';
import * as ctl from '../web/metrics.controller';
const r = Router();
r.get('/', ctl.metrics);
export default r;
