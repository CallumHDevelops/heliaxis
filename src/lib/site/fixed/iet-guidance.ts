/**
 * The EIC's "Guidance for recipients" page (to be appended to the certificate), SPEC D14 and 15.
 *
 * Copied from page 7 of the IET's "BS 7671:2018+A4:2026 MODEL FORMS FOR CERTIFICATION AND REPORTING"
 * (15 April 2026). That page's text layer is in a shifted font that doesn't extract, so the wording
 * was transcribed from the page image and read back against it, quotes as the IET prints them. It's
 * printed as the last page of every EIC, draft and final alike.
 */
export const IET_GUIDANCE = {
  source: 'IET model forms BS 7671:2018+A4:2026 (15 April 2026), EIC: Guidance for recipients',
  issue: 'A4:2026',
  verified: true,
  heading: 'ELECTRICAL INSTALLATION CERTIFICATE',
  title: 'GUIDANCE FOR RECIPIENTS (to be appended to the Certificate)',
  paragraphs: [
    'This Certificate has been issued to confirm that the electrical installation work to which it relates has been designed, constructed, inspected and tested in accordance with BS 7671.',
    "You should have received the 'original' Certificate and the person that issued the Certificate should have retained a duplicate. If you were the person ordering the work, but not the owner of the installation, you should pass this Certificate, or a full copy of it including the schedules, immediately to the owner.",
    "The 'original' Certificate should be retained in a safe place and be shown to any person inspecting or undertaking further work on the electrical installation in the future. If you later vacate the property, this Certificate will demonstrate to the new owner that the electrical installation complied with the requirements of BS 7671 at the time the Certificate was issued. The Construction (Design and Management) Regulations require that, for a project covered by those Regulations, a copy of this Certificate, together with schedules, is included in the project health and safety documentation.",
    'For safety reasons, the electrical installation will need to be inspected at appropriate intervals by a skilled person or persons, competent in such work. The maximum time interval recommended before the next inspection is stated in Section D.',
    "This Certificate is intended to be issued only for a new electrical installation or for new work associated with an addition or alteration to an existing installation. It can not be used for the inspection and testing of an existing electrical installation. An 'Electrical Installation Condition Report' is to be issued for such an inspection.",
    'This Certificate is only valid if the Schedule of Inspection has been completed to confirm that all relevant inspections have been carried out and where accompanied by Schedule(s) of Circuit Details and Schedule(s) of Test Results.',
    'Where the installation includes a residual current device (RCD) it should be tested six-monthly by pressing the button marked ‘T’ or ‘Test’. The device should switch off the supply and should then be switched on to restore the supply. If the device does not switch off the supply when the button is pressed, seek expert advice. For safety reasons it is important that this instruction is followed.',
    'Where the installation includes an arc fault detection device (AFDD) having a manual test facility it should be tested six-monthly by pressing the test button. Where an AFDD has both a test button and automatic test function, manufacturer’s instructions should be taken into account with respect to test button operation.',
    'Where the installation includes a surge protective device (SPD) the status indicator should be checked to confirm it is in operational condition in accordance with manufacturer’s information. If the indication shows that the device is not operational, seek expert advice. For safety reasons it is important that this instruction is followed.',
    'Where the installation includes alternative or additional sources of supply, warning notices should be found at the origin or meter position or, if remote from the origin, at the consumer unit or distribution board and at all points of isolation of all sources of supply.',
  ],
};
