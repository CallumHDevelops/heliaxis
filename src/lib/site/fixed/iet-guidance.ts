/**
 * The EIC's "Guidance for recipients" page (to be appended to the certificate), SPEC D14 and 15.
 *
 * The text below is the BS 7671:2018+A2:2022 page as it appears on the ECA's rendition of the IET
 * model form (REGS 1.2, read from a scanned copy, so a few words were tidied where the scan broke
 * them). A4:2026 may have changed it, so `verified` stays false and the EIC is printed without this
 * page, saying "Guidance for recipients to follow", until a person has copied the A4 page from the
 * IET's PDF (REGS 7) into `paragraphs` and flipped `verified` in a commit naming the source.
 */
export const IET_GUIDANCE = {
  source: 'IET model EIC, BS 7671:2018+A2:2022 (ECA rendition): Guidance for recipients',
  issue: 'A2:2022',
  verified: false,
  title: 'Guidance for recipients (to be appended to the Certificate)',
  paragraphs: [
    'This safety Certificate has been issued to confirm that the electrical installation work to which it relates has been designed, constructed, inspected and tested in accordance with BS 7671.',
    'You should have received an ‘original’ Certificate and the person that issued the Certificate should have retained a duplicate. If you were the person ordering the work, but not the owner of the installation, you should pass this Certificate, or a full copy of it including the schedules, immediately to the owner.',
    'The ‘original’ Certificate should be retained in a safe place and be shown to any person inspecting or undertaking further work on the electrical installation in the future. If you later vacate the property, this Certificate will demonstrate to the new owner that the electrical installation complied with the requirements of BS 7671 at the time the Certificate was issued. The Construction (Design and Management) Regulations require that, for a project covered by those Regulations, a copy of this Certificate, together with Schedules, is included in the project Health and Safety documentation.',
    'For safety reasons, the electrical installation will need to be inspected at appropriate intervals by a skilled person or persons, competent in such work. The maximum time interval recommended before the next inspection is stated on Page 1 under ‘NEXT INSPECTION’.',
    'This Certificate is intended to be issued only for a new electrical installation or for new work associated with an addition or alteration to an existing installation. It should not have been issued for the inspection and testing of an existing electrical installation. An ‘Electrical Installation Condition Report’ should be issued for such an inspection.',
    'This Certificate is only valid if the Schedule of Inspections has been completed to confirm that all relevant inspections have been carried out and where accompanied by Schedule(s) of Circuit Details and Test Results.',
    'Where the installation includes a residual current device (RCD) it should be tested six-monthly by pressing the button marked ‘T’ or ‘Test’. The device should switch off the supply and should then be switched on to restore the supply. If the device does not switch off the supply when the button is pressed, seek expert advice. For safety reasons it is important that this instruction is followed.',
    'Where the installation includes an arc fault detection device (AFDD) having a manual test facility it should be tested six-monthly by pressing the test button. Where a AFDD has both a test button and automatic test function, manufacturer’s instructions shall be followed with respect to test button operation.',
    'Where the installation includes a surge protective device (SPD) the status indicator should be checked to confirm it is in operational condition in accordance with manufacturer’s information. If the indication shows that the device is not operational, seek expert advice. For safety reasons it is important that this instruction is followed.',
    'Where the installation includes alternative or additional sources of supply, warning notices should be found at the origin or meter position or, if remote from the origin, at the consumer unit or distribution board and at all points of isolation of all sources of supply.',
  ],
};
