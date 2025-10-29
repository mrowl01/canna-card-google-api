// Create POC card with BUDZOTIC_3 template
app.get('/poc-card', async (req, res) => {
  try {
    const { name } = req.query;

    // Validate name parameter
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
        message: 'Please provide a name parameter in the query string'
      });
    }

    // Generate random user ID
    const randomUserId = `poc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Fixed configuration for POC
    const templateSlug = 'budzotic3';
    const initialPoints = 0;
    const barcodeType = 'PDF_417';

    // Get the template
    const template = await templateService.getTemplate(templateSlug);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: `Template '${templateSlug}' does not exist. Please ensure it is created and published.`
      });
    }

    // Check if template is published
    if (!template.is_published) {
      return res.status(400).json({
        success: false,
        error: 'Template not published',
        message: `Template '${templateSlug}' exists but is not published yet.`
      });
    }

    // Calculate tier (Bronze for 0 points)
    const tier = 'Bronze';

    // Prepare barcode configuration
    const barcodeConfig = {
      type: barcodeType,
      value: `MEMBER_${randomUserId}`
    };

    // Create loyalty object options
    const options = {
      points: initialPoints,
      tier,
      memberName: name,
      classId: template.class_id,
      barcode: barcodeConfig,
      template: template
    };

    // Create the card
    const result = await loyaltyObjectService.createObjectWithSaveUrl(randomUserId, options);

    if (result.success) {
      // Store card in database
      await dbService.createCard(
        randomUserId,
        name,
        initialPoints,
        tier,
        result.objectId,
        templateSlug
      );

      // Return the save URL
      res.json({
        success: true,
        userId: randomUserId,
        memberName: name,
        points: initialPoints,
        tier: tier,
        barcodeType: barcodeType,
        barcodeValue: barcodeConfig.value,
        saveUrl: result.saveUrl,
        message: `POC card created successfully for ${name}`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/poc-card');
  }
});