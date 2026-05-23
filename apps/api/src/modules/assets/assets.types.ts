export type AssetType =
  | 'FACE'
  | 'CHARACTER'
  | 'VOICE'
  | 'BACKGROUND'
  | 'LOGO'
  | 'SCENE'
  // Live Cam reenactment target identity (realistic / anime / cartoon /
  // fantasy / stylized). Stored in the same user_assets table — `type` is
  // free text (app-validated), so no Postgres migration is required.
  | 'AVATAR';

export const ASSET_TYPES: AssetType[] = [
  'FACE',
  'CHARACTER',
  'VOICE',
  'BACKGROUND',
  'LOGO',
  'SCENE',
  'AVATAR',
];

export interface CreateAssetInput {
  type: AssetType;
  name: string;
  url: string;
  thumbnailUrl?: string;
  meta?: Record<string, unknown>;
}

export interface UpdateAssetInput {
  name?: string;
  thumbnailUrl?: string;
  meta?: Record<string, unknown>;
}

export interface CharacterExpression {
  name: string;
  url: string;
}

export interface CreateCharacterInput {
  name: string;
  description?: string;
  baseImageUrl?: string;
  expressions?: CharacterExpression[];
  stylePrompt?: string;
  thumbnailUrl?: string;
}

export type UpdateCharacterInput = Partial<CreateCharacterInput>;
