import type { NextFunction, Request, Response } from 'express';
import { UserNotificationPreferencesService } from '../services/user-notification-preferences.service';

export class UserNotificationPreferencesController {
  constructor(private readonly preferencesService: UserNotificationPreferencesService) {}

  getMy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      const preferences = await this.preferencesService.getForUser(userId);
      res.json({ preferences });
    } catch (err) {
      next(err);
    }
  };

  updateMy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      const preferences = await this.preferencesService.update(userId, req.body);
      res.json({ preferences });
    } catch (err) {
      next(err);
    }
  };
}
