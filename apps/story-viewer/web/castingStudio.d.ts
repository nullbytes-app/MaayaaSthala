export const initialCastingState: {
  storyId: string | null;
  byCharId: Record<string, any>;
  order: string[];
  approved: boolean;
  approvedAt: string | null;
};

export function reduceCastingState(state: any, action: any): any;
export function getSelectedCastSelections(state: any): Array<{
  charId: string;
  artifactId: string;
  source: string;
}>;
export function buildApprovePayload(state: any): {
  storyId: string | null;
  castSelections: Array<{
    charId: string;
    artifactId: string;
    source: string;
  }>;
};
export function requestCastingPrepare(baseUrl: string, payload: any): Promise<any>;
export function requestGenerateCandidates(baseUrl: string, payload: any): Promise<any>;
export function requestApproveCasting(baseUrl: string, payload: any): Promise<any>;
