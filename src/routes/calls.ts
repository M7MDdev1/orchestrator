import { Router } from 'express';
import * as ctl from '../web/calls.controller';
const r = Router();
r.post('/', ctl.create);
r.get('/:id', ctl.getOne);
r.patch('/:id', ctl.updateIfPending);
r.get('/', ctl.listByStatus);
export default r;
