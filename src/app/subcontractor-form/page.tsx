'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Zod validation schema
const formSchema = z.object({
  companyName: z.string()
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name must not exceed 100 characters'),
  
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name should only contain letters and spaces'),
  
  contactNumber: z.string()
    .min(10, 'Contact number must be at least 10 digits')
    .max(15, 'Contact number must not exceed 15 digits')
    .regex(/^[0-9+\s()-]+$/, 'Invalid phone number format'),
  
  email: z.string()
    .email('Please enter a valid email address')
    .min(5, 'Email is too short')
    .max(100, 'Email must not exceed 100 characters'),
  
  businessAddress: z.string()
    .min(10, 'Business address must be at least 10 characters')
    .max(500, 'Business address must not exceed 500 characters'),
  
  businessRegNumber: z.string()
    .min(5, 'Business registration number must be at least 5 characters')
    .max(50, 'Business registration number must not exceed 50 characters'),
  
  vatNumber: z.string()
    .max(50, 'VAT number must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  
  cisNumber: z.string()
    .max(50, 'CIS number must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  
  bankDetails: z.string()
    .min(10, 'Bank details must be at least 10 characters')
    .max(500, 'Bank details must not exceed 500 characters'),
  
  paymentTerms: z.enum(['14 Day', '30 Day']),
  
  additionalInfo: z.string()
    .max(1000, 'Additional information must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),
  
  sendEmailReceipt: z.boolean().catch(false),
});

type SubcontractorFormData = z.infer<typeof formSchema>;

export default function SubcontractorOnboarding() {

  const [insuranceDocs, setInsuranceDocs] = useState<File[]>([]);
  const [qualificationDocs, setQualificationDocs] = useState<File[]>([]);
  const [insuranceError, setInsuranceError] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<SubcontractorFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: '',
      fullName: '',
      contactNumber: '',
      email: '',
      businessAddress: '',
      businessRegNumber: '',
      vatNumber: '',
      cisNumber: '',
      bankDetails: '',
      paymentTerms: '14 Day',
      additionalInfo: '',
      sendEmailReceipt: false,
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'insurance' | 'qualification') => {
    const files = Array.from(e.target.files || []);
    
    // Validate file size (100MB limit per file)
    const maxSize = 100 * 1024 * 1024; // 100MB in bytes
    const invalidFiles = files.filter(file => file.size > maxSize);
    
    if (invalidFiles.length > 0) {
      if (type === 'insurance') {
        setInsuranceError(`Some files exceed 100MB limit: ${invalidFiles.map(f => f.name).join(', ')}`);
      }
      return;
    }
    
    if (type === 'insurance') {
      setInsuranceError('');
      const newFiles = [...insuranceDocs, ...files].slice(0, 10);
      setInsuranceDocs(newFiles);
    } else {
      const newFiles = [...qualificationDocs, ...files].slice(0, 10);
      setQualificationDocs(newFiles);
    }
  };

  const removeFile = (index: number, type: 'insurance' | 'qualification') => {
    if (type === 'insurance') {
      setInsuranceDocs(prev => prev.filter((_, i) => i !== index));
    } else {
      setQualificationDocs(prev => prev.filter((_, i) => i !== index));
    }
  };

  const onSubmit = async (data: SubcontractorFormData) => {
    // Validate insurance documents
    if (insuranceDocs.length === 0) {
      setInsuranceError('Please upload at least one insurance document');
      return;
    }

    setSubmitStatus('idle');
    setErrorMessage('');
    setInsuranceError('');

    try {
      // Prepare form data for submission
      const submissionData = new window.FormData();
      
      // Add all form fields
      submissionData.append('companyName', data.companyName);
      submissionData.append('fullName', data.fullName);
      submissionData.append('contactNumber', data.contactNumber);
      submissionData.append('email', data.email);
      submissionData.append('businessAddress', data.businessAddress);
      submissionData.append('businessRegNumber', data.businessRegNumber);
      submissionData.append('vatNumber', data.vatNumber || '');
      submissionData.append('cisNumber', data.cisNumber || '');
      submissionData.append('bankDetails', data.bankDetails);
      submissionData.append('paymentTerms', data.paymentTerms);
      submissionData.append('additionalInfo', data.additionalInfo || '');
      submissionData.append('sendEmailReceipt', String(data.sendEmailReceipt));
      
      // Add insurance documents
      insuranceDocs.forEach((file, index) => {
        submissionData.append(`insuranceDoc${index}`, file);
      });
      
      // Add qualification documents
      qualificationDocs.forEach((file, index) => {
        submissionData.append(`qualificationDoc${index}`, file);
      });

      // Submit to our API route
      const response = await fetch('/api/subcontractor', {
        method: 'POST',
        body: submissionData,
      });

      const result = await response.json();

      if (result.success) {
        setSubmitStatus('success');
        
        // Reset form after successful submission
        setTimeout(() => {
          reset();
          setInsuranceDocs([]);
          setQualificationDocs([]);
          setSubmitStatus('idle');
        }, 5000);
      } else {
        throw new Error(result.error || 'Form submission failed');
      }

    } catch (error) {
      console.error('Submission error:', error);
      setSubmitStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Card className="p-8 shadow-xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Subcontractor Onboarding</h1>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* 1. Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                1. Company Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="companyName"
                {...register('companyName')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.companyName ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.companyName && (
                <p className="mt-1 text-sm text-red-600">{errors.companyName.message}</p>
              )}
            </div>

            {/* 2. Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                2. Full Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="fullName"
                {...register('fullName')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.fullName ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.fullName && (
                <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
              )}
            </div>

            {/* 3. Contact Number */}
            <div>
              <label htmlFor="contactNumber" className="block text-sm font-medium text-gray-700 mb-2">
                3. Contact Number <span className="text-red-600">*</span>
              </label>
              <input
                type="tel"
                id="contactNumber"
                {...register('contactNumber')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.contactNumber ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.contactNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.contactNumber.message}</p>
              )}
            </div>

            {/* 4. Email Address */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                4. Email Address <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                id="email"
                {...register('email')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            {/* 5. Registered Business Address */}
            <div>
              <label htmlFor="businessAddress" className="block text-sm font-medium text-gray-700 mb-2">
                5. Registered Business Address <span className="text-red-600">*</span>
              </label>
              <textarea
                id="businessAddress"
                {...register('businessAddress')}
                placeholder="Enter your answer"
                rows={3}
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none ${
                  errors.businessAddress ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.businessAddress && (
                <p className="mt-1 text-sm text-red-600">{errors.businessAddress.message}</p>
              )}
            </div>

            {/* 6. Business Registration Number */}
            <div>
              <label htmlFor="businessRegNumber" className="block text-sm font-medium text-gray-700 mb-2">
                6. Business Registration Number <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="businessRegNumber"
                {...register('businessRegNumber')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.businessRegNumber ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.businessRegNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.businessRegNumber.message}</p>
              )}
            </div>

            {/* 7. VAT Number */}
            <div>
              <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-700 mb-2">
                7. VAT Number
              </label>
              <input
                type="text"
                id="vatNumber"
                {...register('vatNumber')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.vatNumber ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.vatNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.vatNumber.message}</p>
              )}
            </div>

            {/* 8. CIS Number */}
            <div>
              <label htmlFor="cisNumber" className="block text-sm font-medium text-gray-700 mb-2">
                8. CIS Number (If applicable)
              </label>
              <input
                type="text"
                id="cisNumber"
                {...register('cisNumber')}
                placeholder="Enter your answer"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
                  errors.cisNumber ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.cisNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.cisNumber.message}</p>
              )}
            </div>

            {/* 9. Bank Details */}
            <div>
              <label htmlFor="bankDetails" className="block text-sm font-medium text-gray-700 mb-2">
                9. Bank Name, Account Number and Sort Code <span className="text-red-600">*</span>
              </label>
              <textarea
                id="bankDetails"
                {...register('bankDetails')}
                placeholder="Enter your answer"
                rows={3}
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none ${
                  errors.bankDetails ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.bankDetails && (
                <p className="mt-1 text-sm text-red-600">{errors.bankDetails.message}</p>
              )}
            </div>

            {/* 10. Payment Terms */}
            <div>
              <label htmlFor="paymentTerms" className="block text-sm font-medium text-gray-700 mb-2">
                10. Payment Terms (Upon completion) <span className="text-red-600">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    {...register('paymentTerms')}
                    value="14 Day"
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">14 Day</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    {...register('paymentTerms')}
                    value="30 Day"
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">30 Day</span>
                </label>
              </div>
              {errors.paymentTerms && (
                <p className="mt-1 text-sm text-red-600">{errors.paymentTerms.message}</p>
              )}
            </div>

            {/* 11. Insurance Documents */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                11. Please Upload Insurance Documents <span className="text-red-600">*</span>
              </label>
              <p className="text-xs text-gray-600 mb-3">
                (Professional Indemnity, Public Liability, Employers Liability, Product Liability, Trade specific Insurance)
              </p>
              <p className="text-xs text-gray-500 mb-2">
                File number limit: 10 | Single file size limit: 100MB | 
                Allowed file types: Word, Excel, PPT, PDF, Image, Video, Audio
              </p>
              <input
                type="file"
                id="insuranceDocs"
                onChange={(e) => handleFileChange(e, 'insurance')}
                multiple
                accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,image/*,video/*,audio/*"
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 ${
                  insuranceError ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {insuranceError && (
                <p className="mt-1 text-sm text-red-600">{insuranceError}</p>
              )}
              {insuranceDocs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {insuranceDocs.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index, 'insurance')}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 12. Trade Specific Qualifications */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                12. Trade Specific Qualifications
              </label>
              <p className="text-xs text-gray-500 mb-2">
                File number limit: 10 | Single file size limit: 100MB | 
                Allowed file types: Word, Excel, PPT, PDF, Image, Video, Audio
              </p>
              <input
                type="file"
                id="qualificationDocs"
                onChange={(e) => handleFileChange(e, 'qualification')}
                multiple
                accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,image/*,video/*,audio/*"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {qualificationDocs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {qualificationDocs.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index, 'qualification')}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 13. Additional Information */}
            <div>
              <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-700 mb-2">
                13. Additional Information
              </label>
              <textarea
                id="additionalInfo"
                {...register('additionalInfo')}
                placeholder="Enter your answer"
                rows={4}
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none ${
                  errors.additionalInfo ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.additionalInfo && (
                <p className="mt-1 text-sm text-red-600">{errors.additionalInfo.message}</p>
              )}
            </div>

             {/* Email Receipt Checkbox */}
             <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
               <div className="flex items-start space-x-3">
                 <input
                   type="checkbox"
                   id="sendEmailReceipt"
                   {...register('sendEmailReceipt')}
                   className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-1"
                 />
                 <div className="flex-1">
                   <label htmlFor="sendEmailReceipt" className="text-sm font-medium text-gray-900 cursor-pointer block">
                     📧 Send me a confirmation email
                   </label>
                   <p className="text-xs text-gray-600 mt-1">
                     Check this box to receive a copy of your submission for your records. You&apos;ll get a detailed receipt of all the information you provided.
                   </p>
                 </div>
               </div>
             </div>

             {/* Status Messages */}
             {submitStatus === 'success' && (
               <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
                 <p className="font-medium">✅ Form submitted successfully!</p>
                 <p className="text-sm">Thank you for your submission. We will review your information and get back to you within 2-3 business days.</p>
                 <p className="text-xs mt-2">
                   {watch('sendEmailReceipt') && '📧 A confirmation email has been sent to your inbox.'}
                 </p>
               </div>
             )}

            {submitStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                <p className="font-medium">❌ Submission failed</p>
                <p className="text-sm">{errorMessage || 'Please try again or contact support.'}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

