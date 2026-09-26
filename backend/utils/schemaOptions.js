// Shared schema options: expose `id` instead of `_id` and hide internal fields
export const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      delete ret._id;
      delete ret.password;
      return ret;
    },
  },
};
