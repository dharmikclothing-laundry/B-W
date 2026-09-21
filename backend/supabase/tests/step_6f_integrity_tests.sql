-- ============================================================
-- STEP 6F-A INTEGRITY TESTS
-- ============================================================
--
-- Tests:
--
-- 1. Cross-facility machine -> operation must fail
-- 2. Cross-facility employee -> operation must fail
-- 3. Cross-facility machine -> batch must fail
-- 4. Cross-facility batch -> operation must fail
-- 5. Invalid garment inspection relationships must fail
-- 6. Invalid damage report relationships must fail
-- 7. Invalid missing-item report relationships must fail
-- 8. Valid same-facility relationships must succeed
--
-- All test data is rolled back at the end.
-- ============================================================

BEGIN;

DO $$
DECLARE
    -- --------------------------------------------------------
    -- Facilities
    -- --------------------------------------------------------

    v_facility_a_id uuid;
    v_facility_b_id uuid;

    -- --------------------------------------------------------
    -- Machines
    -- --------------------------------------------------------

    v_machine_a_id uuid;
    v_machine_b_id uuid;

    -- --------------------------------------------------------
    -- Profiles / Employees
    -- --------------------------------------------------------

    v_employee_a_id uuid;
    v_employee_b_id uuid;

    -- --------------------------------------------------------
    -- Customer
    -- --------------------------------------------------------

    v_customer_id uuid;

    -- --------------------------------------------------------
    -- Orders
    -- --------------------------------------------------------

    v_order_a_id uuid;
    v_order_b_id uuid;

    -- --------------------------------------------------------
    -- Order items
    -- --------------------------------------------------------

    v_order_a_item_id uuid;
    v_order_b_item_id uuid;

    -- --------------------------------------------------------
    -- Operations
    -- --------------------------------------------------------

    v_operation_a_id uuid;
    v_operation_b_id uuid;

    -- --------------------------------------------------------
    -- Processing batches
    -- --------------------------------------------------------

    v_batch_a_id uuid;
    v_batch_b_id uuid;

BEGIN

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STEP 6F-A INTEGRITY TESTS STARTING';
    RAISE NOTICE '========================================';

    -- ========================================================
    -- SETUP: CREATE FACILITIES
    -- ========================================================

    INSERT INTO public.facilities (
        name,
        address,
        is_active
    )
    VALUES (
        'Step 6F Test Facility A',
        'Local Integrity Test Facility A',
        true
    )
    RETURNING id INTO v_facility_a_id;


    INSERT INTO public.facilities (
        name,
        address,
        is_active
    )
    VALUES (
        'Step 6F Test Facility B',
        'Local Integrity Test Facility B',
        true
    )
    RETURNING id INTO v_facility_b_id;


    RAISE NOTICE 'Created Facility A: %', v_facility_a_id;
    RAISE NOTICE 'Created Facility B: %', v_facility_b_id;


    -- ========================================================
    -- SETUP: CREATE MACHINES
    -- ========================================================

    INSERT INTO public.facility_machines (
        facility_id,
        machine_name,
        machine_type,
        capacity_kg,
        status
    )
    VALUES (
        v_facility_a_id,
        'Step 6F Test Machine A',
        'washer',
        10,
        'available'
    )
    RETURNING id INTO v_machine_a_id;


    INSERT INTO public.facility_machines (
        facility_id,
        machine_name,
        machine_type,
        capacity_kg,
        status
    )
    VALUES (
        v_facility_b_id,
        'Step 6F Test Machine B',
        'washer',
        10,
        'available'
    )
    RETURNING id INTO v_machine_b_id;


    -- ========================================================
    -- SETUP: CREATE PROFILES
    --
    -- These must also exist in auth.users because profiles.id
    -- has a foreign key relationship to auth.users.
    -- ========================================================

    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'step6f.employee.a@example.com',
        '',
        now(),
        '{"provider":"email","providers":["email"]}',
        '{}',
        now(),
        now()
    )
    RETURNING id INTO v_employee_a_id;


    INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        is_active
    )
    VALUES (
        v_employee_a_id,
        'Step 6F Employee A',
        '9000000001',
        true
    );


    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'step6f.employee.b@example.com',
        '',
        now(),
        '{"provider":"email","providers":["email"]}',
        '{}',
        now(),
        now()
    )
    RETURNING id INTO v_employee_b_id;


    INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        is_active
    )
    VALUES (
        v_employee_b_id,
        'Step 6F Employee B',
        '9000000002',
        true
    );


    -- ========================================================
    -- SETUP: ASSIGN EMPLOYEES TO FACILITIES
    -- ========================================================

    INSERT INTO public.facility_employees (
        facility_id,
        profile_id,
        employee_role,
        is_active
    )
    VALUES (
        v_facility_a_id,
        v_employee_a_id,
        'operator',
        true
    );


    INSERT INTO public.facility_employees (
        facility_id,
        profile_id,
        employee_role,
        is_active
    )
    VALUES (
        v_facility_b_id,
        v_employee_b_id,
        'operator',
        true
    );


    -- ========================================================
    -- SETUP: CREATE CUSTOMER AUTH USER
    -- ========================================================

    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'step6f.customer@example.com',
        '',
        now(),
        '{"provider":"email","providers":["email"]}',
        '{}',
        now(),
        now()
    )
    RETURNING id INTO v_customer_id;


    INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        is_active
    )
    VALUES (
        v_customer_id,
        'Step 6F Test Customer',
        '9000000003',
        true
    );


    INSERT INTO public.customers (
        profile_id,
        referral_code
    )
    VALUES (
        v_customer_id,
        'STEP6FTEST'
    )
    RETURNING id INTO v_customer_id;


    -- ========================================================
    -- SETUP: CREATE TWO ORDERS
    -- ========================================================

    INSERT INTO public.orders (
        order_number,
        customer_id,
        facility_id,
        current_status,
        subtotal,
        discount_amount,
        total_amount
    )
    VALUES (
        'STEP6F-ORDER-A-' || substr(gen_random_uuid()::text, 1, 8),
        v_customer_id,
        v_facility_a_id,
        'draft',
        100,
        0,
        100
    )
    RETURNING id INTO v_order_a_id;


    INSERT INTO public.orders (
        order_number,
        customer_id,
        facility_id,
        current_status,
        subtotal,
        discount_amount,
        total_amount
    )
    VALUES (
        'STEP6F-ORDER-B-' || substr(gen_random_uuid()::text, 1, 8),
        v_customer_id,
        v_facility_b_id,
        'draft',
        100,
        0,
        100
    )
    RETURNING id INTO v_order_b_id;


    -- ========================================================
    -- SETUP: CREATE ORDER ITEMS
    -- ========================================================

    INSERT INTO public.order_items (
        order_id,
        item_name,
        quantity,
        unit_price,
        line_total
    )
    VALUES (
        v_order_a_id,
        'Test Shirt A',
        1,
        100,
        100
    )
    RETURNING id INTO v_order_a_item_id;


    INSERT INTO public.order_items (
        order_id,
        item_name,
        quantity,
        unit_price,
        line_total
    )
    VALUES (
        v_order_b_id,
        'Test Shirt B',
        1,
        100,
        100
    )
    RETURNING id INTO v_order_b_item_id;


    -- ========================================================
    -- TEST 1
    -- MACHINE A -> OPERATION B
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.facility_order_operations (
            order_id,
            facility_id,
            machine_id,
            current_status
        )
        VALUES (
            v_order_b_id,
            v_facility_b_id,
            v_machine_a_id,
            'pending'
        );

        RAISE EXCEPTION
            'TEST 1 FAILED: Cross-facility machine assignment was allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Cross-facility machine assignment is not allowed%'
            THEN
                RAISE NOTICE
                    'TEST 1 PASSED: Cross-facility operation machine rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 2
    -- EMPLOYEE B -> OPERATION A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.facility_order_operations (
            order_id,
            facility_id,
            performed_by,
            current_status
        )
        VALUES (
            v_order_a_id,
            v_facility_a_id,
            v_employee_b_id,
            'pending'
        );

        RAISE EXCEPTION
            'TEST 2 FAILED: Cross-facility employee was allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Profile % is not an active employee of facility %'
            THEN
                RAISE NOTICE
                    'TEST 2 PASSED: Cross-facility employee rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 3
    -- MACHINE B -> BATCH A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.facility_processing_batches (
            facility_id,
            machine_id,
            batch_type,
            status
        )
        VALUES (
            v_facility_a_id,
            v_machine_b_id,
            'washing',
            'pending'
        );

        RAISE EXCEPTION
            'TEST 3 FAILED: Cross-facility batch machine allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Cross-facility machine assignment is not allowed%'
            THEN
                RAISE NOTICE
                    'TEST 3 PASSED: Cross-facility batch machine rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- SETUP: CREATE VALID OPERATIONS
    -- ========================================================

    INSERT INTO public.facility_order_operations (
        order_id,
        facility_id,
        machine_id,
        performed_by,
        current_status
    )
    VALUES (
        v_order_a_id,
        v_facility_a_id,
        v_machine_a_id,
        v_employee_a_id,
        'pending'
    )
    RETURNING id INTO v_operation_a_id;


    INSERT INTO public.facility_order_operations (
        order_id,
        facility_id,
        machine_id,
        performed_by,
        current_status
    )
    VALUES (
        v_order_b_id,
        v_facility_b_id,
        v_machine_b_id,
        v_employee_b_id,
        'pending'
    )
    RETURNING id INTO v_operation_b_id;


    -- ========================================================
    -- SETUP: CREATE VALID BATCHES
    -- ========================================================

    INSERT INTO public.facility_processing_batches (
        facility_id,
        machine_id,
        batch_type,
        status
    )
    VALUES (
        v_facility_a_id,
        v_machine_a_id,
        'washing',
        'pending'
    )
    RETURNING id INTO v_batch_a_id;


    INSERT INTO public.facility_processing_batches (
        facility_id,
        machine_id,
        batch_type,
        status
    )
    VALUES (
        v_facility_b_id,
        v_machine_b_id,
        'washing',
        'pending'
    )
    RETURNING id INTO v_batch_b_id;


    -- ========================================================
    -- TEST 4
    -- OPERATION A -> BATCH B
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.processing_batch_orders (
            batch_id,
            operation_id
        )
        VALUES (
            v_batch_b_id,
            v_operation_a_id
        );

        RAISE EXCEPTION
            'TEST 4 FAILED: Cross-facility batch relationship allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Cross-facility batch relationship is not allowed%'
            THEN
                RAISE NOTICE
                    'TEST 4 PASSED: Cross-facility batch relationship rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 5
    -- GARMENT INSPECTION WITH ORDER B ITEM
    -- ON OPERATION A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.garment_inspections (
            operation_id,
            order_item_id,
            counted_quantity,
            inspected_by
        )
        VALUES (
            v_operation_a_id,
            v_order_b_item_id,
            1,
            v_employee_a_id
        );

        RAISE EXCEPTION
            'TEST 5 FAILED: Invalid garment inspection item allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Order item % belongs to order %, but the operation belongs to order %'
            THEN
                RAISE NOTICE
                    'TEST 5 PASSED: Invalid garment inspection relationship rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 6
    -- GARMENT INSPECTION WITH EMPLOYEE B
    -- ON OPERATION A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.garment_inspections (
            operation_id,
            order_item_id,
            counted_quantity,
            inspected_by
        )
        VALUES (
            v_operation_a_id,
            v_order_a_item_id,
            1,
            v_employee_b_id
        );

        RAISE EXCEPTION
            'TEST 6 FAILED: Cross-facility inspector allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Inspector % is not an active employee%'
            THEN
                RAISE NOTICE
                    'TEST 6 PASSED: Cross-facility inspector rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 7
    -- DAMAGE REPORT WITH ORDER B ITEM
    -- ON OPERATION A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.damage_reports (
            operation_id,
            order_item_id,
            description,
            status,
            detected_by
        )
        VALUES (
            v_operation_a_id,
            v_order_b_item_id,
            'Integrity test damage',
            'open',
            v_employee_a_id
        );

        RAISE EXCEPTION
            'TEST 7 FAILED: Invalid damage report relationship allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Order item % belongs to a different order than operation %'
            THEN
                RAISE NOTICE
                    'TEST 7 PASSED: Invalid damage report relationship rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 8
    -- DAMAGE REPORT WITH EMPLOYEE B
    -- ON OPERATION A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.damage_reports (
            operation_id,
            order_item_id,
            description,
            status,
            detected_by
        )
        VALUES (
            v_operation_a_id,
            v_order_a_item_id,
            'Cross facility employee test',
            'open',
            v_employee_b_id
        );

        RAISE EXCEPTION
            'TEST 8 FAILED: Cross-facility damage reporter allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Reporter % is not an active employee of facility %'
            THEN
                RAISE NOTICE
                    'TEST 8 PASSED: Cross-facility damage reporter rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 9
    -- MISSING ITEM REPORT WITH ORDER B ITEM
    -- ON OPERATION A
    -- MUST FAIL
    -- ========================================================

    BEGIN

        INSERT INTO public.missing_item_reports (
            operation_id,
            order_item_id,
            quantity,
            status
        )
        VALUES (
            v_operation_a_id,
            v_order_b_item_id,
            1,
            'open'
        );

        RAISE EXCEPTION
            'TEST 9 FAILED: Invalid missing-item relationship allowed';

    EXCEPTION
        WHEN OTHERS THEN

            IF SQLERRM LIKE
                'Order item % does not belong to the same order as operation %'
            THEN
                RAISE NOTICE
                    'TEST 9 PASSED: Invalid missing-item relationship rejected';
            ELSE
                RAISE;
            END IF;

    END;


    -- ========================================================
    -- TEST 10
    -- VALID SAME-FACILITY BATCH RELATIONSHIP
    -- MUST SUCCEED
    -- ========================================================

    INSERT INTO public.processing_batch_orders (
        batch_id,
        operation_id
    )
    VALUES (
        v_batch_a_id,
        v_operation_a_id
    );

    RAISE NOTICE
        'TEST 10 PASSED: Valid same-facility batch relationship allowed';


    -- ========================================================
    -- TEST 11
    -- VALID GARMENT INSPECTION
    -- MUST SUCCEED
    -- ========================================================

    INSERT INTO public.garment_inspections (
        operation_id,
        order_item_id,
        counted_quantity,
        inspected_by,
        verified_by
    )
    VALUES (
        v_operation_a_id,
        v_order_a_item_id,
        1,
        v_employee_a_id,
        v_employee_a_id
    );

    RAISE NOTICE
        'TEST 11 PASSED: Valid garment inspection allowed';


    -- ========================================================
    -- TEST 12
    -- VALID DAMAGE REPORT
    -- MUST SUCCEED
    -- ========================================================

    INSERT INTO public.damage_reports (
        operation_id,
        order_item_id,
        description,
        status,
        detected_by
    )
    VALUES (
        v_operation_a_id,
        v_order_a_item_id,
        'Valid same-facility damage test',
        'open',
        v_employee_a_id
    );

    RAISE NOTICE
        'TEST 12 PASSED: Valid damage report allowed';


    -- ========================================================
    -- TEST 13
    -- VALID MISSING ITEM REPORT
    -- MUST SUCCEED
    -- ========================================================

    INSERT INTO public.missing_item_reports (
        operation_id,
        order_item_id,
        quantity,
        status
    )
    VALUES (
        v_operation_a_id,
        v_order_a_item_id,
        1,
        'open'
    );

    RAISE NOTICE
        'TEST 13 PASSED: Valid missing-item report allowed';


    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ALL STEP 6F-A TESTS PASSED';
    RAISE NOTICE '========================================';

END;
$$;

-- Roll back every test record.
ROLLBACK;