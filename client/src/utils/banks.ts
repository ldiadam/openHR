export interface BankInfo {
  name: string;
  swift: string;
  branchAddress: string;
}

export const DEFAULT_BRANCH_NAME = 'Head Office Jakarta';
export const DEFAULT_BRANCH_CODE = 'XXX';

export const BANK_DIRECTORY: BankInfo[] = [
  { name: 'BCA', swift: 'CENAIDJA', branchAddress: 'Menara BCA, Jl. M.H. Thamrin No. 1, Jakarta 10310' },
  { name: 'Bank Mandiri', swift: 'BMRIIDJA', branchAddress: 'Plaza Mandiri, Jl. Jend. Gatot Subroto Kav. 36-38, Jakarta 12190' },
  { name: 'BRI', swift: 'BRINIDJA', branchAddress: 'Gedung BRI I, Jl. Jend. Sudirman Kav. 44-46, Jakarta 10210' },
  { name: 'BNI', swift: 'BNINIDJA', branchAddress: 'Gedung BNI, Jl. Jend. Sudirman Kav. 1, Jakarta 10220' },
  { name: 'BSI (Bank Syariah Indonesia)', swift: 'BSMDIDJA', branchAddress: 'Jl. M.H. Thamrin No. 5, Jakarta 10340' },
  { name: 'CIMB Niaga', swift: 'BNIAIDJA', branchAddress: 'Menara Sentraya, Fl. 32, Jl. Iskandarsyah Raya No. 1A, Jakarta 12160' },
  { name: 'Permata Bank', swift: 'BBBAIDJA', branchAddress: 'WTC II, Fl. 21, Jl. Jend. Sudirman No. 29-31, Jakarta 12920' },
  { name: 'Bank Danamon', swift: 'BDINIDJA', branchAddress: 'Menara Bank Danamon, Jl. HR. Rasuna Said Blok C No. 10, Jakarta 12920' },
  { name: 'BTN', swift: 'BTANIDJA', branchAddress: 'Menara BTN, Fl. 10, Jl. Gajah Mada No. 1, Jakarta 10130' },
  { name: 'Panin Bank', swift: 'PINBIDJA', branchAddress: 'Panin Bank Centre, Jl. Jend. Sudirman No. 1, Jakarta 10270' },
  { name: 'OCBC NISP', swift: 'NISPIDJA', branchAddress: 'OCBC NISP Tower, Jl. Prof. Dr. Satrio Kav. 25, Jakarta 12940' },
  { name: 'Bank Mega', swift: 'MEGAIDJA', branchAddress: 'Menara Bank Mega, Jl. Kapten Tendean No. 12-14A, Jakarta 12790' },
  { name: 'BTPN / Jenius', swift: 'SUNIIDJA', branchAddress: 'Menara BTPN, Jl. Dr. Ide Anak Agung Gde Agung Kav. 5.5-5.6, Jakarta 12950' },
  { name: 'Bank Jago', swift: 'JAGBIDJA', branchAddress: 'Menara BTPN, Fl. 46, Jl. Dr. Ide Anak Agung Gde Agung Kav. 5.5-5.6, Jakarta 12950' },
  { name: 'Maybank Indonesia', swift: 'IBBKIDJA', branchAddress: 'Sentral Senayan 3, Jl. Asia Afrika No. 8, Jakarta 10270' },
  { name: 'UOB Indonesia', swift: 'BBIJIDJA', branchAddress: 'UOB Plaza, Jl. M.H. Thamrin No. 10, Jakarta 10230' },
  { name: 'DBS Indonesia', swift: 'DBSBIDJA', branchAddress: 'DBS Bank Tower, Jl. Prof. Dr. Satrio Kav. 3-5, Jakarta 12940' },
  { name: 'Bank Sinarmas', swift: 'SBJKIDJA', branchAddress: 'Sinarmas Land Plaza, Fl. 8, Jl. M.H. Thamrin No. 51, Jakarta 10350' },
  { name: 'Bank Muamalat', swift: 'MUABIDJA', branchAddress: 'Muamalat Tower, Jl. Prof. Dr. Satrio No. 18, Jakarta 12940' },
  { name: 'SeaBank Indonesia', swift: 'SSPIIDJA', branchAddress: 'Gama Tower, Fl. 35, Jl. H.R. Rasuna Said No. 2, Jakarta 12950' },
  { name: 'Allo Bank', swift: 'ALOBIDJA', branchAddress: 'Menara Bank Mega, Fl. 5-6, Jl. Kapten Pierre Tendean No. 12-14A, Jakarta 12790' },
  { name: 'Bank DKI', swift: 'BDKIIDJA', branchAddress: 'Jl. Ir. H. Juanda No. 34, Jakarta 10120' },
];

export function getBankPrefill(name?: string) {
  const match = BANK_DIRECTORY.find(
    (bank) => bank.name.toLowerCase() === (name || '').trim().toLowerCase()
  );
  if (!match) return null;
  return {
    bank_swift_code: match.swift,
    bank_branch_name: DEFAULT_BRANCH_NAME,
    bank_branch_code: DEFAULT_BRANCH_CODE,
    bank_branch_address: match.branchAddress,
  };
}
