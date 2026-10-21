import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const Mixed = Schema.Types.Mixed;

// Shared options: hide Mongo internals, keep app-level string `id` as public key
const baseOptions = {
  versionKey: false,
  minimize: false,
  toJSON: {
    transform: (_doc, ret) => {
      delete ret._id;
      return ret;
    },
  },
};

const idField = { type: String, required: true, unique: true, index: true };

// ================= ADMIN =================
const AdminSchema = new Schema(
  {
    id: idField,
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    lastLogin: String,
  },
  baseOptions
);

// ================= GUARD =================
const GuardSchema = new Schema(
  {
    id: idField,
    guardId: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    mobile: { type: String, default: '' },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    gateAssigned: { type: String, default: '' },
    factoryLocation: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    createdAt: String,
    lastLogin: String,
    recordSource: { type: String, enum: ['seed', 'live'], default: 'live' },
  },
  baseOptions
);

// ================= WORKER =================
const WorkerDocumentSchema = new Schema(
  {
    id: String,
    name: String,
    type: String,
    fileUrl: String,
    uploadedAt: String,
    fileName: String,
    mimeType: String,
    size: Number,
    hasFile: Boolean,
  },
  { _id: false }
);

const WorkerSchema = new Schema(
  {
    id: idField,
    employeeId: { type: String, required: true },
    fullName: { type: String, required: true },
    mobileNumber: { type: String, default: '' },
    emergencyContact: { type: String, default: '' },
    address: String,
    profilePhoto: { type: String, default: '' },
    department: { type: String, default: 'Production' },
    designation: { type: String, default: 'Worker' },
    workingTime: { type: String, default: '09:00 AM – 07:00 PM' },
    monthlySalary: { type: Number, default: 15000 },
    bankAccountNumber: String,
    bankIfsc: String,
    aadhaarNumber: String,
    panNumber: String,
    dateOfJoining: String,
    status: { type: String, enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'], default: 'ACTIVE' },
    documents: { type: [WorkerDocumentSchema], default: [] },
    recordSource: { type: String, enum: ['seed', 'live'], default: 'live' },
    seq: { type: Number, index: true },
  },
  baseOptions
);

// ================= ATTENDANCE =================
const AttendanceSchema = new Schema(
  {
    id: idField,
    workerId: { type: String, required: true, index: true },
    workerName: String,
    workerEmployeeId: String,
    workerPhoto: String,
    date: { type: String, required: true, index: true },
    workingTime: String,
    workingStartTime: String,
    workingEndTime: String,
    checkInTime: String,
    checkInDateTime: String,
    checkInPhoto: String,
    checkInMarkedByGuardId: String,
    checkInMarkedByGuardName: String,
    checkInGate: String,
    lateMinutes: { type: Number, default: 0 },
    checkOutTime: String,
    checkOutDateTime: String,
    checkOutPhoto: String,
    checkOutMarkedByGuardId: String,
    checkOutMarkedByGuardName: String,
    checkOutGate: String,
    totalWorkingMinutes: { type: Number, default: 0 },
    earlyExitMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    otCalculatedMinutes: Number,
    otManuallyAdjusted: Boolean,
    status: {
      type: String,
      enum: ['PRESENT', 'PRESENT - LATE', 'PRESENT + OT', 'COMPLETED', 'ABSENT', 'NOT_ARRIVED'],
      default: 'PRESENT',
    },
    createdAt: String,
    updatedAt: String,
    isManuallyModified: Boolean,
    modificationHistory: { type: [Mixed], default: undefined },
    recordSource: { type: String, enum: ['seed', 'live'], default: 'live' },
    seq: { type: Number, index: true },
  },
  baseOptions
);
AttendanceSchema.index({ workerId: 1, date: 1 });

// ================= RULES (singleton) =================
const RulesSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    salaryBasisDays: { type: Number, default: 30 },
    gracePeriodMinutes: { type: Number, default: 0 },
    otRateMultiplier: { type: Number, default: 1 },
    requireCheckOutPhoto: { type: Boolean, default: true },
    otMinimumMinutes: { type: Number, default: 30 },
    checkInOpensBeforeMinutes: { type: Number, default: 120 },
    allowCheckInAnytime: { type: Boolean, default: true }, // 24-hour mode: no shift window
  },
  { ...baseOptions, strict: false }
);

// ================= PAYROLL =================
const PayrollSchema = new Schema(
  {
    id: idField,
    workerId: { type: String, index: true },
    workerName: String,
    employeeId: String,
    month: { type: String, index: true },
    department: String,
    workingTime: String,
    baseSalary: Number,
    salaryBasisDays: Number,
    dailyWage: Number,
    normalWorkingMinutesPerDay: Number,
    perMinuteSalary: Number,
    totalDaysInMonth: Number,
    daysPresent: Number,
    daysAbsent: Number,
    absentDeduction: Number,
    totalLateMinutes: Number,
    totalLateDeduction: Number,
    totalEarlyExitMinutes: Number,
    totalEarlyExitDeduction: Number,
    totalOtMinutes: Number,
    totalOtPay: Number,
    advanceAvailable: Number,
    advanceDeduction: Number,
    advanceCarriedForward: Number,
    linkedAdvanceDeductions: { type: [Mixed], default: [] },
    netSalary: Number,
    paymentStatus: { type: String, enum: ['DRAFT', 'APPROVED', 'PAID'], default: 'APPROVED' },
    generatedAt: String,
    paidAt: String,
    remarks: String,
    recordSource: String,
    seq: { type: Number, index: true },
  },
  baseOptions
);

// ================= ADVANCE =================
const AdvanceSchema = new Schema(
  {
    id: idField,
    transactionNumber: { type: String, index: true },
    workerId: { type: String, index: true },
    workerName: String,
    employeeId: String,
    amount: Number,
    advanceDate: String,
    salaryMonth: String,
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer'], default: 'Cash' },
    paymentReference: String,
    remarks: String,
    status: {
      type: String,
      enum: ['ACTIVE', 'PARTIALLY_DEDUCTED', 'FULLY_DEDUCTED', 'VOIDED'],
      default: 'ACTIVE',
    },
    deductedAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, default: 0 },
    recordSource: String,
    createdBy: String,
    createdAt: String,
    updatedAt: String,
    voidReason: String,
    voidedAt: String,
    voidedBy: String,
  },
  baseOptions
);

// ================= ADVANCE DEDUCTION =================
const AdvanceDeductionSchema = new Schema(
  {
    id: idField,
    advanceTransactionId: { type: String, index: true },
    transactionNumber: String,
    payrollId: String,
    workerId: { type: String, index: true },
    month: { type: String, index: true },
    deductedAmount: Number,
    createdAt: String,
  },
  baseOptions
);

// ================= AUDIT LOG =================
const AuditLogSchema = new Schema(
  {
    id: idField,
    timestamp: { type: String, index: true },
    actorRole: { type: String, enum: ['ADMIN', 'GUARD'] },
    actorId: String,
    actorName: String,
    actionType: String,
    details: String,
    targetWorkerId: String,
    targetWorkerName: String,
    metadata: Mixed,
    seq: { type: Number, index: true },
  },
  baseOptions
);

// ================= WORKER DOCUMENT FILE (binary stored separately) =================
const WorkerFileSchema = new Schema(
  {
    id: idField, // same as document id
    workerId: { type: String, required: true, index: true },
    mimeType: { type: String, required: true },
    fileName: String,
    size: Number,
    data: { type: Buffer, required: true },
    createdAt: String,
  },
  { versionKey: false }
);

// ================= COUNTER (ordering sequence) =================
const CounterSchema = new Schema({ _id: String, value: { type: Number, default: 0 } }, { versionKey: false });

export const Admin = model('Admin', AdminSchema);
export const Guard = model('Guard', GuardSchema);
export const Worker = model('Worker', WorkerSchema);
export const Attendance = model('Attendance', AttendanceSchema);
export const Rules = model('Rules', RulesSchema);
export const Payroll = model('Payroll', PayrollSchema);
export const Advance = model('Advance', AdvanceSchema);
export const AdvanceDeduction = model('AdvanceDeduction', AdvanceDeductionSchema);
export const AuditLog = model('AuditLog', AuditLogSchema);
export const Counter = model('Counter', CounterSchema);
export const WorkerFile = model('WorkerFile', WorkerFileSchema);

export async function nextSeq(name) {
  const c = await Counter.findByIdAndUpdate(name, { $inc: { value: 1 } }, { new: true, upsert: true });
  return c.value;
}

// Strip Mongo internals from lean docs
export const PUBLIC = '-_id -seq';
