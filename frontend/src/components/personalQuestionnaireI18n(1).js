function humanizeKey(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

const BASE_COPY = {
  identity: 'Identity',
  personalData: 'Personal data',
  address: 'Address',
  privateContactFamily: 'Private contact & family',
  financial: 'Financial details',
  driverLicense: 'Driver license',
  uniform: 'Uniform',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  language: 'Language',
  taxClass: 'Tax class',
  birthDay: 'Birth date',
  birthPlace: 'Birth place',
  birthName: 'Birth name',
  gender: 'Gender',
  nationality: 'Nationality',
  maritalStatus: 'Marital status',
  streetName: 'Street',
  houseNumber: 'House number',
  addressLine2: 'Address line 2',
  postalCode: 'Postal code',
  city: 'City',
  country: 'Country',
  privateEmail: 'Private e-mail',
  personalMobile: 'Personal mobile',
  children: 'Children',
  childNamesBirthDate: 'Children names / birth dates',
  bankName: 'Bank name',
  accountHolder: 'Account holder',
  iban: 'IBAN',
  bic: 'BIC',
  taxId: 'Tax ID',
  svNumber: 'Social security number',
  insuranceCompany: 'Insurance company',
  churchTax: 'Church tax',
  churchTaxType: 'Church tax type',
  drivingLicenseIssueDate: 'Issue date',
  drivingLicenseExpiryDate: 'Expiry date',
  drivingLicenseAuthority: 'Authority',
  jacke: 'Jacket',
  hose: 'Trousers',
  shirt: 'Shirt',
  schuhe: 'Shoes',
};

export function getPersonalQuestionnaireCopy(_locale = 'de') {
  return new Proxy(BASE_COPY, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop];
      return target[prop] || humanizeKey(prop);
    },
  });
}

export default {
  getPersonalQuestionnaireCopy,
};
