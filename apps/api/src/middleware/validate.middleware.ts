import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const fieldErrors: Record<string, string[]> = {};

    errors.array().forEach((error) => {
      if (error.type === 'field') {
        const field = error.path;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(error.msg);
      }
    });

    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: fieldErrors,
    });
    return;
  }

  next();
}
