import { Router } from 'express';
import * as ctl from '../web/callbacks.controller';
const r = Router();
r.post('/call-status', ctl.callStatus);
export default r;
